// src/repo/interfaces.ts
import {
  DocumentRow,
  UpsertDocumentInput,
  ChunkRow,
  InsertChunkInput,
  Retrieved,
  RepoFilter,
} from "./types";

export interface DocumentsRepository {
  upsert(input: UpsertDocumentInput): Promise<DocumentRow>;
  deleteByRepoPathCommit(
    repoFull: string,
    path: string,
    commitSha: string,
  ): Promise<void>;
  listRepos(): Promise<string[]>;
}

export interface ChunksRepository {
  replaceForDocument(
    documentId: number,
    rows: InsertChunkInput[],
  ): Promise<void>;
}

export interface SearchRepository {
  hybridSearch(params: {
    query: string;
    queryVectorLiteral: string; // e.g., "[0.1,0.2,...]"
    topK?: number;
    filter?: RepoFilter;
  }): Promise<Retrieved[]>;
}

export interface Repositories {
  documents: DocumentsRepository;
  chunks: ChunksRepository;
  search: SearchRepository;
}
