// src/search.ts
import { embedOne } from "./embeddings";
import { repos } from "./repo";

export type Retrieved = {
  score: number;
  repo: string;
  path: string;
  symbol?: string | null;
  start_line?: number | null;
  end_line?: number | null;
  commit: string;
  preview: string;
};

export type RepoFilterInput = { all?: boolean; repos?: string[] };

/**
 * Hybrid retrieval (vector + keyword via repo layer), with optional repo filter.
 * - filter.all === true → search across all repos
 * - filter.repos = ["org/repoA", ...] → restrict to that subset
 */
export async function hybridSearch(
  query: string,
  k = 20,
  filter?: RepoFilterInput,
): Promise<Retrieved[]> {
  // embed and build vector literal
  const qv = await embedOne(query);
  const queryVectorLiteral = `[${qv.join(",")}]`;

  const repoFilter =
    filter?.all || !filter?.repos?.length
      ? ({ mode: "all" } as const)
      : ({ mode: "subset", repos: filter.repos! } as const);

  // Delegate to repo-layer search (already blends/sorts)
  const items = await repos.search.hybridSearch({
    query,
    queryVectorLiteral,
    topK: k,
    filter: repoFilter,
  });

  // Keep API identical to your previous return shape (minus link; rag builds it)
  return items.map((i) => ({
    score: i.score,
    repo: i.repo,
    path: i.path,
    symbol: i.symbol ?? null,
    start_line: i.start_line ?? null,
    end_line: i.end_line ?? null,
    commit: i.commit,
    preview: i.preview,
  }));
}
