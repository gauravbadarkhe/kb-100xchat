import { embedOne, toPgVectorLiteral } from "./embeddings";
import { pool as db } from "./repo/pg";

export type Retrieved = {
  score: number;
  repo: string;
  path: string;
  symbol?: string | null;
  start_line?: number | null;
  end_line?: number | null;
  commit: string;
  preview: string;
  link: string;
  document_id: number;
};

export type RepoFilter = { repos?: string[] };

function permalink(
  repoFull: string,
  commit: string,
  path: string,
  s?: number | null,
  e?: number | null,
) {
  const range = s && e && e !== s ? `#L${s}-L${e}` : s ? `#L${s}` : "";
  return `https://github.com/${repoFull}/blob/${commit}/${encodeURI(path)}${range}`;
}

/**
 * Hybrid: vectors (factsheets + normal chunks) + keyword + structured pins
 * - factsheets get a boost
 * - structured pins (endpoints/symbols/edges) are forced into the set with a high base score
 */
export async function retrieveHybrid(
  q: string,
  k = 24,
  filter?: RepoFilter,
): Promise<Retrieved[]> {
  const qv = toPgVectorLiteral(await embedOne(q));
  const args: any[] = [qv, k, q, k];
  let repoWhere = "";
  if (filter?.repos?.length) {
    args.push(filter.repos);
    repoWhere = `AND d.repo_full = ANY($${args.length})`;
  }

  const { rows } = await db.query(
    `
    WITH vec AS (
      SELECT c.id, d.id AS document_id, d.repo_full, d.commit_sha, (c.meta->>'path') AS path, c.meta, c.text,
             (1 - (c.embedding <=> $1::vector)) AS vs,
             CASE WHEN (c.meta->>'kind')='factsheet' THEN 0.08 ELSE 0.0 END AS boost -- favor factsheets slightly
      FROM chunks c
      JOIN documents d ON d.id = c.document_id
      WHERE 1=1 ${repoWhere}
      ORDER BY c.embedding <=> $1::vector
      LIMIT $2
    ),
    kw AS (
      SELECT c.id, d.id AS document_id, d.repo_full, d.commit_sha, (c.meta->>'path') AS path, c.meta, c.text,
             similarity(c.text, $3) AS ks, 0.0 AS boost
      FROM chunks c
      JOIN documents d ON d.id = c.document_id
      WHERE 1=1 ${repoWhere} AND c.text % $3
      ORDER BY c.text <-> $3
      LIMIT $4
    ),
    -- Structured pins: endpoints/symbols that fuzzy-match the query terms.
    terms AS (
      SELECT regexp_split_to_table(regexp_replace($3, '[^\\w/.-]+', ' ', 'g'), '\\s+') AS t
    ),
    pins_e AS (
      SELECT DISTINCT ON (e.id)
        d.id AS document_id, d.repo_full, d.commit_sha, d.path,
        jsonb_build_object(
          'start_line', e.start_line, 'end_line', e.end_line,
          'path', d.path, 'symbol', e.handler_name, 'title', coalesce(e.method,'ALL')||' '||coalesce(e.path,'/')
        ) AS meta,
        '' AS text,
        0.85::float AS ps
      FROM endpoints e
      JOIN documents d ON d.id = e.document_id
      WHERE 1=1 ${repoWhere}
        AND EXISTS (SELECT 1 FROM terms WHERE
          t <> '' AND (
            e.path ILIKE '%'||t||'%' OR e.method ILIKE '%'||t||'%' OR e.handler_name ILIKE '%'||t||'%'
          )
        )
      LIMIT 60
    ),
    pins_s AS (
      SELECT DISTINCT ON (s.id)
        d.id AS document_id, d.repo_full, d.commit_sha, d.path,
        jsonb_build_object(
          'start_line', s.start_line, 'end_line', s.end_line,
          'path', d.path, 'symbol', s.name, 'title', s.kind||':'||s.name
        ) AS meta,
        '' AS text,
        0.78::float AS ps
      FROM symbols s
      JOIN documents d ON d.id = s.document_id
      WHERE 1=1 ${repoWhere}
        AND EXISTS (SELECT 1 FROM terms WHERE t <> '' AND s.name ILIKE '%'||t||'%')
      LIMIT 60
    ),
    pins_edges AS (
      SELECT DISTINCT ON (e.id)
        d.id AS document_id, d.repo_full, d.commit_sha, d.path,
        jsonb_build_object(
          'start_line', e.start_line, 'end_line', e.end_line,
          'path', d.path, 'symbol', e.from_symbol_name, 'title', e.edge_type||'→'||e.to_kind||':'||e.to_value
        ) AS meta,
        '' AS text,
        0.72::float AS ps
      FROM edges e
      JOIN documents d ON d.id = e.from_document_id
      WHERE 1=1 ${repoWhere}
        AND (e.to_value ILIKE '%'||$3||'%' OR e.edge_type ILIKE '%'||$3||'%')
      LIMIT 40
    ),
    merged AS (
      SELECT document_id, repo_full, commit_sha, path, meta, text,
             coalesce(vs,0) + boost AS score
      FROM vec
      UNION ALL
      SELECT document_id, repo_full, commit_sha, path, meta, text,
             0.35 + coalesce(ks,0) AS score
      FROM kw
      UNION ALL
      SELECT document_id, repo_full, commit_sha, path, meta, text, ps AS score FROM pins_e
      UNION ALL
      SELECT document_id, repo_full, commit_sha, path, meta, text, ps AS score FROM pins_s
      UNION ALL
      SELECT document_id, repo_full, commit_sha, path, meta, text, ps AS score FROM pins_edges
    )
    SELECT * FROM merged
    `,
    args,
  );

  const out: Retrieved[] = rows.map((r: any) => {
    const m = r.meta || {};
    const s = m.start_line ?? null;
    const e = m.end_line ?? null;
    return {
      score: Number(r.score),
      repo: r.repo_full,
      path: m.path || r.path,
      symbol: m.symbol || m.title || null,
      start_line: s,
      end_line: e,
      commit: r.commit_sha,
      preview: r.text || "",
      link: permalink(r.repo_full, r.commit_sha, m.path || r.path, s, e),
      document_id: r.document_id,
    };
  });

  // sort & return
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, Math.max(k, 24));
}

/** Keyword-only fallback for “aggressive” ladder */
export async function keywordOnly(
  q: string,
  filter?: RepoFilter,
): Promise<Retrieved[]> {
  const args: any[] = [q, 64];
  let repoWhere = "";
  if (filter?.repos?.length) {
    args.push(filter.repos);
    repoWhere = `AND d.repo_full = ANY($${args.length})`;
  }

  const { rows } = await db.query(
    `
    SELECT d.id AS document_id, d.repo_full, d.commit_sha, (c.meta->>'path') AS path, c.meta, c.text,
           similarity(c.text, $1) AS score
    FROM chunks c
    JOIN documents d ON d.id = c.document_id
    WHERE 1=1 ${repoWhere} AND c.text % $1
    ORDER BY c.text <-> $1
    LIMIT $2
    `,
    args,
  );

  return rows.map((r: any) => {
    const m = r.meta || {};
    const s = m.start_line ?? null;
    const e = m.end_line ?? null;
    return {
      score: Number(r.score),
      repo: r.repo_full,
      path: m.path || r.path,
      symbol: m.symbol || m.title || null,
      start_line: s,
      end_line: e,
      commit: r.commit_sha,
      preview: r.text,
      link: permalink(r.repo_full, r.commit_sha, m.path || r.path, s, e),
      document_id: r.document_id,
    };
  });
}
