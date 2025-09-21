// src/api/ask.ts (or wherever your handler lives)
import type { Request, Response } from "express";
import { z } from "zod";
import { retrieveHybrid, keywordOnly, type Retrieved } from "../reterival";
import { groupPathsByRepo } from "../keywords";
import { buildPrompt, collectFacts } from "../prompt";
// chatAsObject comes from your existing LLM wrapper

type Citation = {
  link: string;
  repo: string;
  path: string;
  start_line?: number;
  end_line?: number;
};
type AskPayload = {
  q: string;
  k?: number;
  filter?: { repos?: string[] };
  hints?: { aggressive?: boolean; paths?: string[] };
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
      const more = await retrieveHybrid(
        question,
        Math.max(48, TOP_K_BASE * 2),
        filter,
      );
      pruned = prune([...retrieved, ...more], 0.15);
    }

    if (!pruned.length || (body.hints?.aggressive && pruned.length < 3)) {
      const kw = await keywordOnly(question, filter);
      pruned = prune([...pruned, ...kw], 0.0);
    }

    // If caller gave exact file hints, force-include them
    const hintPaths = body.hints?.paths || [];
    if (hintPaths.length) {
      const grouped = groupPathsByRepo(hintPaths);
      const forced: Retrieved[] = [];
      for (const [repoFull, paths] of Object.entries(grouped)) {
        // You said you already have this repo method; keeping as-is:
        const rows = await (
          await import("../repo")
        ).repos.search.getByPath({
          repoFull,
          path: paths[0], // adapt if your getByPath supports multiple
          limitChunks: 8,
        });
        forced.push(...(rows as any));
      }
      forced.forEach((f) => (f.score = Math.max(f.score, 0.99)));
      pruned = uniqueByFile([...forced, ...pruned]);
    }

    // Final top context (no rerank)
    const top = pruned.slice(0, 8);

    if (!top.length) {
      return res.json({
        answer: "Not enough information in the provided sources.",
        citations: [] as Citation[],
      });
    }

    // 🔥 NEW: pull structured facts for the selected context
    const facts = await collectFacts(top);

    // Build prompt with FACTS + sources
    const { system, user } = buildPrompt(question, top, facts);

    // console.log(system);

    console.log("------------");

    console.log("facts", top);
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

    const { chatAsObject } = await import("../ai/index"); // your existing wrapper
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
