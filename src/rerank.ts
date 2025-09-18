// src/rerank.ts
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Cand = {
  score: number;
  repo: string;
  path: string;
  preview: string;
  symbol?: string | null;
  start_line?: number | null;
  end_line?: number | null;
  commit: string;
};

export async function llmRerank(
  query: string,
  cands: Cand[],
  keep = 8,
): Promise<Cand[]> {
  const items = cands
    .map(
      (c, i) =>
        `#${i + 1}\nFILE: ${c.repo}/${c.path}${c.symbol ? ` · ${c.symbol}` : ""}\nTEXT:\n${c.preview.slice(0, 800)}`,
    )
    .join("\n\n");
  const prompt = `Rank the following snippets by how well they answer: "${query}". Return a JSON array of indices (1-based) in best-to-worst order, top ${keep} only.`;

  const rsp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: "You reorder snippets by relevance to the question.",
      },
      {
        role: "user",
        content: `${prompt}\n\nSNIPPETS:\n${items}\n\nJSON ONLY (example: [3,1,2,5,4])`,
      },
    ],
  });

  let order: number[] = [];
  try {
    order = JSON.parse(rsp.choices[0].message?.content || "[]");
  } catch {}
  const picked = order
    .map((i) => cands[i - 1])
    .filter(Boolean)
    .slice(0, keep);

  // fallback if model returns junk
  if (!picked.length) return cands.slice(0, keep);
  return picked;
}
