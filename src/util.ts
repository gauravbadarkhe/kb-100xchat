// src/util.ts
import { embedOne } from "./embeddings";
import { repos } from "./repo";

export type RepoFilterInput = { all?: boolean; repos?: string[] };

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

/**
 * Search helper using repo-layer hybrid search (vector + keyword).
 * Keeps the old shape: { score, repo, path, symbol, start_line, end_line, commit, link, preview }
 */
export async function search(query: string, k = 8, filter?: RepoFilterInput) {
  const qv = await embedOne(query);
  const queryVectorLiteral = `[${qv.join(",")}]`;

  const repoFilter =
    filter?.all || !filter?.repos?.length
      ? ({ mode: "all" } as const)
      : ({ mode: "subset", repos: filter!.repos! } as const);

  const items = await repos.search.hybridSearch({
    query,
    queryVectorLiteral,
    topK: k,
    filter: repoFilter,
  });

  // PgSearchRepository already builds commit-pinned permalinks (link) and includes meta fields
  return items.map((r) => ({
    score: Number(r.score.toFixed(4)),
    repo: r.repo,
    path: r.path,
    symbol: r.symbol || null,
    start_line: r.start_line ?? null,
    end_line: r.end_line ?? null,
    commit: r.commit,
    link: r.link, // already commit-pinned with optional #Lx-Ly
    preview:
      r.preview.length > 1200 ? r.preview.slice(0, 1200) + "…" : r.preview,
  }));
}
