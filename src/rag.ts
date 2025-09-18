// src/rag.ts
import type { Request, Response } from "express";
import OpenAI from "openai";
import { db } from "./db";
import { embedOne, toPgVectorLiteral } from "./embeddings";

// ---------- Types ----------
type Retrieved = {
  score: number;
  repo: string;
  path: string;
  symbol?: string | null;
  start_line?: number | null;
  end_line?: number | null;
  commit: string;
  preview: string;
  link: string;
};

type Citation = {
  link: string;
  repo: string;
  path: string;
  start_line?: number;
  end_line?: number;
};

type AskPayload = { q: string; k?: number };

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---------- Helpers ----------
function permalink(
  repoFull: string,
  commit: string,
  path: string,
  s?: number | null,
  e?: number | null,
) {
  const [owner, repo] = repoFull.split("/");
  const range = s && e && e !== s ? `#L${s}-L${e}` : s ? `#L${s}` : "";
  return `https://github.com/${owner}/${repo}/blob/${commit}/${encodeURI(
    path,
  )}${range}`;
}

function uniqueByFile(items: Retrieved[]) {
  const seen = new Set<string>();
  const out: Retrieved[] = [];
  for (const it of items) {
    const key = `${it.repo}::${it.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

// ---------- Hybrid Retrieval (vector + keyword) ----------
export async function hybridSearch(
  query: string,
  k = 24,
): Promise<Retrieved[]> {
  const qVec = toPgVectorLiteral(await embedOne(query));

  // Pull top-k by vector and top-k by keyword (pg_trgm), then merge
  const { rows } = await db.query(
    `
    WITH vec AS (
      SELECT
        c.id,
        d.repo_full,
        d.commit_sha,
        d.path,
        c.meta,
        c.text,
        (1 - (c.embedding <=> $1::vector)) AS vs
      FROM chunks c
      JOIN documents d ON d.id = c.document_id
      ORDER BY c.embedding <=> $1::vector
      LIMIT $2
    ),
    kw AS (
      SELECT
        c.id,
        d.repo_full,
        d.commit_sha,
        d.path,
        c.meta,
        c.text,
        similarity(c.text, $3) AS ks
      FROM chunks c
      JOIN documents d ON d.id = c.document_id
      WHERE c.text % $3
      ORDER BY c.text <-> $3
      LIMIT $2
    ),
    merged AS (
      SELECT id, repo_full, commit_sha, path, meta, text, vs, NULL::float AS ks FROM vec
      UNION
      SELECT id, repo_full, commit_sha, path, meta, text, NULL::float AS vs, ks FROM kw
    )
    SELECT * FROM merged
    `,
    [qVec, k, query],
  );

  // Blend scores (tune weights if needed)
  const BLEND_V = 0.65;
  const BLEND_K = 0.35;

  const blended: Retrieved[] = rows.map((r: any) => {
    const meta = r.meta || {};
    const vs = Number(r.vs ?? 0);
    const ks = Number(r.ks ?? 0);
    const score = BLEND_V * vs + BLEND_K * ks;

    const start = meta.start_line ?? null;
    const end = meta.end_line ?? null;
    const link = permalink(
      r.repo_full,
      r.commit_sha,
      meta.path || r.path,
      start,
      end,
    );

    return {
      score,
      repo: r.repo_full,
      path: meta.path || r.path,
      symbol: meta.symbol || meta.title || null,
      start_line: start,
      end_line: end,
      commit: r.commit_sha,
      preview: r.text,
      link,
    };
  });

  // Sort high → low, return
  blended.sort((a, b) => b.score - a.score);
  return blended;
}

// ---------- LLM Rerank (cheap pass) ----------
export async function llmRerank(
  query: string,
  cands: Retrieved[],
  keep = 8,
): Promise<Retrieved[]> {
  if (!cands.length) return [];
  const snippets = cands
    .map(
      (c, i) =>
        `#${i + 1}\nFILE: ${c.repo}/${c.path}${c.symbol ? ` · ${c.symbol}` : ""}\nTEXT:\n` +
        c.preview.slice(0, 900),
    )
    .join("\n\n");

  const prompt =
    `Rank the following snippets by how well they answer the question.\n` +
    `Question: "${query}"\n\n` +
    `Return ONLY a JSON array of indices (1-based), best-to-worst, limited to top ${keep}.\n` +
    `Example: [3,1,2,5,4]\n\nSNIPPETS:\n${snippets}`;

  const rsp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: "You are a ranking engine. Output JSON only.",
      },
      { role: "user", content: prompt },
    ],
  });

  let order: number[] = [];
  try {
    order = JSON.parse(rsp.choices[0]?.message?.content || "[]");
  } catch {
    // ignore; fallback below
  }

  const picked = order
    .map((i) => cands[i - 1])
    .filter(Boolean)
    .slice(0, keep);

  return picked.length ? picked : cands.slice(0, keep);
}

// ---------- Prompt assembly ----------
function buildPrompt(question: string, sources: Retrieved[]) {
  const srcList = sources.map((s, i) => `[${i + 1}] ${s.link}`).join("\n");
  const ctx = sources
    .map((s, i) => {
      const header =
        `SOURCE [${i + 1}] ${s.repo}/${s.path}` +
        (s.symbol ? ` · ${s.symbol}` : "") +
        (s.start_line
          ? ` · L${s.start_line}${s.end_line ? `-${s.end_line}` : ""}`
          : "") +
        `\n${s.link}`;
      const sep = "\n----\n";
      const body =
        s.preview.length > 1800
          ? s.preview.slice(0, 1800) + "\n..."
          : s.preview;
      return `${header}${sep}${body}`;
    })
    .join("\n\n");

  const system =
    `You are a senior engineer. Answer ONLY with facts grounded in the provided sources.\n` +
    `Rules:\n` +
    `- Cite with [n] markers, where n matches the index in the SOURCES list.\n` +
    `- Prefer short code snippets (≤ 30 lines) and concrete steps.\n` +
    `- If info is missing, say "Not enough information in the provided sources."`;

  const user =
    `QUESTION:\n${question}\n\n` +
    `SOURCES:\n${srcList}\n\n` +
    `CONTEXT:\n${ctx}\n\n` +
    `RESPONSE FORMAT (JSON):\n` +
    `{\n  "answer": "final answer in markdown with [n] citations",\n  "citations": [\n    {"link":"<url>","repo":"<org/repo>","path":"<file>","start_line":10,"end_line":30}\n  ]\n}\n\n` +
    `Instructions:\n` +
    `- Insert [n] markers where you rely on a source.\n` +
    `- In "citations", include ONLY the sources you referenced in the answer.\n` +
    `- If unsupported, set "answer" accordingly and return empty "citations".`;

  return { system, user };
}

// ---------- Main /ask handler ----------
export async function ask(req: Request, res: Response) {
  try {
    const body = (req.body || {}) as AskPayload;
    const question = String(body.q || "").trim();
    if (!question) return res.status(400).json({ error: "q required" });

    const TOP_K = Number.isFinite(body.k as any) ? Number(body.k) : 24;

    // 1) Retrieve
    const retrieved = await hybridSearch(question, TOP_K);

    // 2) Guards: score threshold + dedupe by file
    const MIN_SCORE = 0.2;
    const pruned = uniqueByFile(retrieved.filter((r) => r.score >= MIN_SCORE));

    if (!pruned.length) {
      return res.json({
        answer: "Not enough information in the provided sources.",
        citations: [] as Citation[],
      });
    }

    // 3) Rerank → top 8
    const top = await llmRerank(question, pruned, 8);

    // 4) Build prompt and call LLM for grounded answer
    const { system, user } = buildPrompt(question, top);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" } as any,
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { answer: raw, citations: [] };
    }

    // 5) Post-filter citations to only those we actually retrieved
    const valid = new Map<string, Retrieved>();
    for (const t of top) valid.set(t.link, t);

    const citations: Citation[] = Array.isArray(parsed.citations)
      ? parsed.citations
          .filter((c: any) => typeof c?.link === "string" && valid.has(c.link))
          .map((c: any) => {
            const t = valid.get(c.link)!;
            return {
              link: t.link,
              repo: t.repo,
              path: t.path,
              start_line: t.start_line ?? undefined,
              end_line: t.end_line ?? undefined,
            };
          })
      : [];

    // 6) If answer has no [n] markers and no citations, be conservative
    const answerStr = String(parsed.answer || "").trim();
    const hasMarkers = /\[\d+\]/.test(answerStr);
    const finalAnswer =
      (hasMarkers && citations.length) || answerStr
        ? answerStr
        : "Not enough information in the provided sources.";

    return res.json({ answer: finalAnswer, citations });
  } catch (e: any) {
    console.error("ask error:", e?.stack || e?.message || e);
    return res
      .status(500)
      .json({ error: "ask_failed", detail: e?.message || "unknown" });
  }
}
