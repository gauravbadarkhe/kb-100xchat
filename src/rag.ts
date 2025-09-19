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
type Hints = { paths?: string[]; identifiers?: string[]; aggressive?: boolean };
type AskPayload = {
  q: string;
  k?: number;
  filter?: RepoFilterInput;
  hints?: Hints;
};

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

function groupPathsByRepo(paths: string[]) {
  // supports either "org/repo/file.ts" or separate "org/repo", "path"
  return paths.reduce(
    (acc, full) => {
      const parts = full.split("/");
      if (parts.length < 3) return acc;
      const repoFull = parts.slice(0, 2).join("/");
      const path = parts.slice(2).join("/");
      (acc[repoFull] ||= []).push(path);
      return acc;
    },
    {} as Record<string, string[]>,
  );
}

async function retrieveHybrid(
  question: string,
  topK: number,
  filter: RepoFilterInput | undefined,
) {
  const qv = await embedOne(question);
  const queryVectorLiteral = `[${qv.join(",")}]`;
  const normFilter =
    filter?.all || !filter?.repos?.length
      ? ({ mode: "all" } as const)
      : ({ mode: "subset", repos: filter!.repos! } as const);

  return repos.search.hybridSearch({
    query: question,
    queryVectorLiteral,
    topK,
    filter: normFilter,
  });
}

async function keywordOnly(
  question: string,
  filter: RepoFilterInput | undefined,
) {
  // Reuse hybridSearch with a neutral vector and very high topK? Better: do a term-biased hack:
  // Quick trick: call hybrid twice with slight query variants emphasizing keywords.
  return retrieveHybrid(`"${question}"`, 32, filter);
}

export async function ask(req: Request, res: Response) {
  try {
    const body = (req.body || {}) as AskPayload;
    const question = String(body.q || "").trim();
    if (!question) return res.status(400).json({ error: "q required" });

    const TOP_K_BASE = Number.isFinite(body.k as any) ? Number(body.k) : 16;
    const filter = body.filter;

    // Pass 1: normal retrieval
    let retrieved = await retrieveHybrid(question, TOP_K_BASE, filter);

    // Guard/dedupe
    const prune = (items: Retrieved[], minScore = 0.25) =>
      uniqueByFile(items.filter((r) => r.score >= minScore));

    let pruned = prune(retrieved, 0.25);

    // If weak, try retry ladder
    if (!pruned.length || (body.hints?.aggressive && pruned.length < 3)) {
      // Pass 2: bump K and lower threshold
      const more = await retrieveHybrid(
        question,
        Math.max(48, TOP_K_BASE * 2),
        filter,
      );
      pruned = prune([...retrieved, ...more], 0.15);
    }

    if (!pruned.length || (body.hints?.aggressive && pruned.length < 3)) {
      // Pass 3: keyword-only bias
      const kw = await keywordOnly(question, filter);
      pruned = prune([...pruned, ...kw], 0.0);
    }

    // If caller gave exact file hints, force-include them
    const hintPaths = body.hints?.paths || [];
    if (hintPaths.length) {
      const grouped = groupPathsByRepo(hintPaths);
      const forced: Retrieved[] = [];
      for (const [repoFull, paths] of Object.entries(grouped)) {
        for (const p of paths) {
          const rows = await repos.search.getByPath({
            repoFull,
            path: p,
            limitChunks: 8,
          });
          forced.push(...rows);
        }
      }
      // De-dupe and give forced ones a tiny boost so they make the top 8
      forced.forEach((f) => (f.score = Math.max(f.score, 0.99)));
      pruned = uniqueByFile([...forced, ...pruned]);
    }

    // Final top context (no rerank as requested)
    const top = pruned.slice(0, 8);

    if (!top.length) {
      return res.json({
        answer: "Not enough information in the provided sources.",
        citations: [] as Citation[],
      });
    }

    const { system, user } = buildPrompt(question, top);

    // Schema for safe JSON
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

    // Post-filter citations
    const valid = new Map<string, Retrieved>(top.map((t) => [t.link, t]));
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
