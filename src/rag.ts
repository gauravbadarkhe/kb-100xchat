// src/rag.ts
import type { Request, Response } from "express";
import OpenAI from "openai";
import { embedOne } from "./embeddings";
import { repos } from "./repo";

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
  link: string; // commit-pinned permalink (built in repo layer)
};

type Citation = {
  link: string;
  repo: string;
  path: string;
  start_line?: number;
  end_line?: number;
};

type RepoFilterInput = { all?: boolean; repos?: string[] };
type AskPayload = { q: string; k?: number; filter?: RepoFilterInput };

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---------- Small helpers ----------
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

/**
 * Wrapper around repo-layer hybrid search.
 * Accepts optional repo filter: all (default) or subset.
 */
async function retrieve(
  question: string,
  k: number,
  repoFilter?: RepoFilterInput,
): Promise<Retrieved[]> {
  const qv = await embedOne(question);
  const queryVectorLiteral = `[${qv.join(",")}]`;

  const filter =
    repoFilter?.all || !repoFilter?.repos?.length
      ? ({ mode: "all" } as const)
      : ({ mode: "subset", repos: repoFilter!.repos! } as const);

  const items = await repos.search.hybridSearch({
    query: question,
    queryVectorLiteral,
    topK: k,
    filter,
  });

  // Already blended/sorted in repo layer; just return
  return items;
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
        `#${i + 1}\nFILE: ${c.repo}/${c.path}${
          c.symbol ? ` · ${c.symbol}` : ""
        }\nTEXT:\n` + c.preview.slice(0, 900),
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

    // 1) Retrieve (via repo layer) with optional repo filter
    const retrieved = await retrieve(question, TOP_K, body.filter);

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
