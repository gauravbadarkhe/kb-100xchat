// src/repo/pgRepositories.ts
import type { PoolClient } from "pg";
import { pool, withTx } from "./pg";
import {
  DocumentRow,
  UpsertDocumentInput,
  InsertChunkInput,
  Retrieved,
  RepoFilter,
} from "./types";

function permalink(
  repoFull: string,
  commit: string,
  path: string,
  s?: number | null,
  e?: number | null,
) {
  const [owner, repo] = repoFull.split("/");
  const range = s && e && e !== s ? `#L${s}-L${e}` : s ? `#L${s}` : "";
  return `https://github.com/${owner}/${repo}/blob/${commit}/${encodeURI(path)}${range}`;
}

export class PgDocumentsRepository {
  async upsert(input: UpsertDocumentInput): Promise<DocumentRow> {
    const { rows } = await pool.query<DocumentRow>(
      `INSERT INTO documents (repo_full, commit_sha, path, lang, sha)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (repo_full, commit_sha, path)
       DO UPDATE SET sha=EXCLUDED.sha, lang=COALESCE(EXCLUDED.lang, documents.lang)
       RETURNING *`,
      [
        input.repoFull,
        input.commitSha,
        input.path,
        input.lang ?? null,
        input.sha,
      ],
    );
    return rows[0];
  }

  async deleteByRepoPathCommit(
    repoFull: string,
    path: string,
    commitSha: string,
  ): Promise<void> {
    await pool.query(
      `DELETE FROM documents WHERE repo_full=$1 AND path=$2 AND commit_sha=$3`,
      [repoFull, path, commitSha],
    );
  }

  async listRepos(): Promise<string[]> {
    const { rows } = await pool.query<{ repo_full: string }>(
      `SELECT DISTINCT repo_full FROM documents ORDER BY repo_full`,
    );
    return rows.map((r) => r.repo_full);
  }
}

export class PgChunksRepository {
  async replaceForDocument(
    documentId: number,
    rows: InsertChunkInput[],
  ): Promise<void> {
    await withTx(async (c: PoolClient) => {
      await c.query(`DELETE FROM chunks WHERE document_id = $1`, [documentId]);
      for (const r of rows) {
        // Vector param as string literal and cast to vector
        const vectorLiteral = `[${r.embedding.join(",")}]`;
        await c.query(
          `INSERT INTO chunks (document_id, ordinal, text, meta, hash, embedding)
           VALUES ($1,$2,$3,$4,$5,$6::vector)`,
          [
            documentId,
            r.ordinal,
            r.text,
            JSON.stringify(r.meta),
            r.hash,
            vectorLiteral,
          ],
        );
      }
    });
  }
}

export class PgSearchRepository {
  async hybridSearch(params: {
    query: string;
    queryVectorLiteral: string;
    topK?: number;
    filter?: RepoFilter;
  }): Promise<Retrieved[]> {
    const {
      query,
      queryVectorLiteral,
      topK = 24,
      filter = { mode: "all" },
    } = params;

    const filtersSql =
      filter.mode === "subset" && filter.repos.length
        ? {
            clause: `AND d.repo_full = ANY($4::text[])`,
            params: [filter.repos],
          }
        : { clause: ``, params: [] };

    const sql = `
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
        WHERE 1=1 ${filtersSql.clause}
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
          similarity(c.text, $3::text) AS ks
        FROM chunks c
        JOIN documents d ON d.id = c.document_id
        WHERE c.text % $3::text ${filtersSql.clause.replace("$4", "$5")}
        ORDER BY c.text <-> $3::text
        LIMIT $2
      ),
      merged AS (
        SELECT id, repo_full, commit_sha, path, meta, text, vs, NULL::float AS ks FROM vec
        UNION
        SELECT id, repo_full, commit_sha, path, meta, text, NULL::float AS vs, ks FROM kw
      )
      SELECT * FROM merged
    `;

    const paramsArr: any[] =
      filter.mode === "subset" && filter.repos.length
        ? [queryVectorLiteral, topK, query, filter.repos, filter.repos]
        : [queryVectorLiteral, topK, query];

    const { rows } = await pool.query<any>(sql, paramsArr);

    const BLEND_V = 0.65;
    const BLEND_K = 0.35;

    const blended = rows.map((r: any) => {
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
      } as Retrieved;
    });

    blended.sort((a, b) => b.score - a.score);
    return blended;
  }
}
