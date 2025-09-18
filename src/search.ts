// src/search.ts
import { db } from "./db";
import { embedOne } from "./embeddings";
import { toPgVectorLiteral } from "./embeddings";

type Row = {
  repo_full: string; commit_sha: string; path: string; meta: any; text: string;
  vs: number; ks: number; -- vector score, keyword score
};

export async function hybridSearch(query: string, k = 20) {
  const qv = toPgVectorLiteral(await embedOne(query));
  const rows = await db.query<Row>(
    `
    WITH vec AS (
      SELECT c.id, d.repo_full, d.commit_sha, d.path, c.meta, c.text,
             1 - (c.embedding <=> $1::vector) AS vs
      FROM chunks c
      JOIN documents d ON d.id = c.document_id
      ORDER BY c.embedding <=> $1::vector
      LIMIT $2
    ),
    kw AS (
      SELECT c.id, d.repo_full, d.commit_sha, d.path, c.meta, c.text,
             similarity(c.text, $3) AS ks
      FROM chunks c
      JOIN documents d ON d.id = c.document_id
      WHERE c.text % $3
      ORDER BY c.text <-> $3
      LIMIT $2
    ),
    merged AS (
      SELECT * FROM vec
      UNION
      SELECT * FROM kw
    )
    SELECT * FROM merged;`,
    [qv, k, query]
  );

  // blend score: tune weights (try 0.65/0.35)
  const blend = rows.rows.map(r => {
    const meta = r.meta as any;
    const score = 0.65 * (r as any).vs + 0.35 * (r as any).ks;
    return {
      score,
      repo: r.repo_full,
      path: r.path,
      symbol: meta.symbol || meta.title || null,
      start_line: meta.start_line || null,
      end_line: meta.end_line || null,
      commit: r.commit_sha,
      preview: r.text
    };
  });

  // sort and return top N
  blend.sort((a, b) => b.score - a.score);
  return blend.slice(0, k);
}

