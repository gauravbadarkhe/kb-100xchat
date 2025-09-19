// src/rag.ts
import type { Request, Response } from "express";
import { repos } from "./repo";
import { embedOne } from "./embeddings";
import { chatAsObject } from "./ai";
import { z } from "zod";

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

type RepoFilterInput = { all?: boolean; repos?: string[] };
type AskPayload = { q: string; k?: number; filter?: RepoFilterInput };

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
        s.preview.length > 1000
          ? s.preview.slice(0, 1000) + "\n..."
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

export async function ask(req: Request, res: Response) {
  try {
    const body = (req.body || {}) as AskPayload;
    const question = String(body.q || "").trim();
    if (!question) return res.status(400).json({ error: "q required" });

    const TOP_K = Number.isFinite(body.k as any) ? Number(body.k) : 16;

    // Retrieval via repo layer with optional filter
    const qv = await embedOne(question);
    const queryVectorLiteral = `[${qv.join(",")}]`;
    const filter =
      body.filter?.all || !body.filter?.repos?.length
        ? ({ mode: "all" } as const)
        : ({ mode: "subset", repos: body.filter!.repos! } as const);

    const retrieved = await repos.search.hybridSearch({
      query: question,
      queryVectorLiteral,
      topK: TOP_K,
      filter,
    });

    // Guards: score threshold + dedupe by file
    const MIN_SCORE = 0.25;
    const pruned = uniqueByFile(retrieved.filter((r) => r.score >= MIN_SCORE));
    const top = pruned.slice(0, 8); // no rerank

    if (!top.length) {
      return res.json({
        answer: "Not enough information in the provided sources.",
        citations: [] as Citation[],
      });
    }

    const { system, user } = buildPrompt(question, top);

    // JSON schema with Zod (safer than ad-hoc JSON.parse)
    const AnswerSchema = z.object({
      answer: z.string(),
      citations: z
        .array(
          z.object({
            link: z.string().url(),
            repo: z.string(),
            path: z.string(),
            start_line: z.number().optional(),
            end_line: z.number().optional(),
          }),
        )
        .optional()
        .default([]),
    });

    const parsed = await chatAsObject({ system, user, schema: AnswerSchema });

    // Post-filter citations to only those retrieved
    const valid = new Map<string, Retrieved>();
    for (const t of top) valid.set(t.link, t);

    const citations: Citation[] = (parsed.citations || [])
      .filter((c: any) => valid.has(c.link))
      .map((c) => {
        const t = valid.get(c.link)!;
        return {
          link: t.link,
          repo: t.repo,
          path: t.path,
          start_line: t.start_line ?? undefined,
          end_line: t.end_line ?? undefined,
        };
      });

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
