// src/embeddings.ts
import OpenAI from "openai";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { data } = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: texts,
  });
  return data.map((d) => d.embedding as number[]);
}

export function toPgVectorLiteral(v: number[]) {
  // pgvector expects bracketed, comma-separated numbers
  // Avoid spaces to be safe across versions/parsers
  return `[${v.join(",")}]`;
}

export async function embedOne(text: string): Promise<number[]> {
  const [v] = await embedBatch([text]);
  return v;
}
