// src/ask.ts
import OpenAI from "openai";
import { search } from "./util";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Retrieved = {
  id?: string; // optional if you want
  score: number;
  repo: string;
  path: string;
  symbol?: string | null;
  start_line?: number | null;
  end_line?: number | null;
  commit: string;
  link: string;
  preview: string; // chunk text (already in your search result)
};

type Citation = {
  link: string;
  repo: string;
  path: string;
  start_line?: number | null;
  end_line?: number | null;
};

type AskResult = {
  answer: string;
  citations: Citation[];
};

function formatContext(chunks: Retrieved[], maxChars = 10000) {
  // Pack the most relevant chunks, cap total chars to avoid token blowup
  const out: string[] = [];
  let used = 0;
  for (const c of chunks) {
    const header = `SOURCE ${c.link}\nFILE ${c.repo}/${c.path}${c.symbol ? ` · ${c.symbol}` : ""}${c.start_line ? ` · L${c.start_line}${c.end_line ? `-${c.end_line}` : ""}` : ""}\n`;
    const body =
      c.preview.length > 1800 ? c.preview.slice(0, 1800) + "\n..." : c.preview;
    const block = header + "----\n" + body + "\n\n";
    if (used + block.length > maxChars) break;
    out.push(block);
    used += block.length;
  }
  return out.join("");
}

function toCitations(chunks: Retrieved[]): Citation[] {
  return chunks.map((c) => ({
    link: c.link,
    repo: c.repo,
    path: c.path,
    start_line: c.start_line || undefined,
    end_line: c.end_line || undefined,
  }));
}

const SYSTEM = `You are a senior engineer. Answer ONLY with facts grounded in the provided sources.
Rules:
- If you don't find evidence in sources, say you don't have enough information.
- When you state a fact, attach a citation marker like [1], [2], etc. Use the index from the SOURCES list order.
- Prefer precise code snippets and exact API usage over generic explanations.
- Keep answers concise but complete; use bullet points for steps.
- Never invent file paths, endpoints, or parameters.`;

function userPrompt(question: string, sources: Retrieved[]) {
  const ctx = formatContext(sources);
  const srcList = sources.map((s, i) => `[${i + 1}] ${s.link}`).join("\n");
  return `QUESTION:
${question}

SOURCES (ordered):
${srcList}

CONTEXT (read carefully; cite using [index]):
${ctx}

INSTRUCTIONS:
- Use the sources above to answer the question.
- Show short code snippets when useful (≤ 30 lines), pulled from sources.
- Attach [index] after each statement that relies on a source.
- If the answer is uncertain or not found, say so explicitly and suggest where to look next.`;
}
