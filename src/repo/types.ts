// src/repo/types.ts
export type DocumentRow = {
  id: number;
  repo_full: string;
  commit_sha: string;
  path: string;
  lang: string | null;
  sha: string;
  created_at: string;
};

export type ChunkRow = {
  id: number;
  document_id: number;
  ordinal: number;
  text: string;
  meta: any;
  hash: string;
  // embedding lives in DB, not fetched in plain CRUD by default
};

export type UpsertDocumentInput = {
  repoFull: string;
  commitSha: string;
  path: string;
  lang?: string | null;
  sha: string;
};

export type InsertChunkInput = {
  documentId: number;
  ordinal: number;
  text: string;
  meta: any;
  hash: string;
  embedding: number[]; // pgvector
};

export type RepoFilter = { mode: "all" } | { mode: "subset"; repos: string[] }; // ["org/repoA", "org/repoB"]

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
};
