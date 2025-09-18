// src/util.ts
import { db } from "./db";
import { embedOne, toPgVectorLiteral } from "./embeddings";

export function permalink(
  owner: string,
  repo: string,
  commit: string,
  path: string,
  s?: number,
  e?: number,
) {
  const range = s ? (e && e !== s ? `#L${s}-L${e}` : `#L${s}`) : "";
  return `https://github.com/${owner}/${repo}/blob/${commit}/${encodeURI(path)}${range}`;
}

export async function search(query: string, k = 8) {
  const qvArr = await embedOne(query);
  const qv = toPgVectorLiteral(qvArr);

  const rows = await db.query(
    `SELECT d.repo_full, d.commit_sha, (d.path) AS path, c.meta, c.text,
            1 - (c.embedding <=> $1::vector) AS score     -- <-- CAST HERE
     FROM chunks c
     JOIN documents d ON d.id = c.document_id
     ORDER BY c.embedding <=> $1::vector
     LIMIT $2`,
    [qv, k],
  );

  return rows.rows.map((r) => {
    const meta = r.meta as any;
    const [owner, repo] = String(r.repo_full).split("/");
    const link = permalink(
      owner,
      repo,
      r.commit_sha,
      meta.path,
      meta.start_line,
      meta.end_line,
    );
    const preview = r.text.length > 1200 ? r.text.slice(0, 1200) + "…" : r.text;
    return {
      score: Number(r.score.toFixed(4)),
      repo: r.repo_full,
      path: meta.path,
      symbol: meta.symbol || meta.title || null,
      start_line: meta.start_line || null,
      end_line: meta.end_line || null,
      commit: r.commit_sha,
      link,
      preview,
    };
  });
}
