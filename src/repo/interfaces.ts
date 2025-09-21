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
  getByPath(params: {
    repoFull: string;
    path: string;
    limitChunks?: number; // e.g., 6
  }): Promise<Retrieved[]>;
}

export interface Repositories {
  documents: DocumentsRepository;
  chunks: ChunksRepository;
  search: SearchRepository;
  analysis: AnalysisRepo;
}

// src/repo/types.ts

export interface AnalysisRepo {
  clearForDocument(documentId: number): Promise<void>;

  insertSymbols(
    documentId: number,
    rows: Array<{
      language: string;
      kind: string;
      name: string;
      signature?: string | null;
      start_line?: number | null;
      end_line?: number | null;
      modifiers?: Record<string, any>;
      meta?: Record<string, any>;
    }>,
  ): Promise<void>;

  insertEndpoints(
    documentId: number,
    rows: Array<{
      language: string;
      protocol?: string;
      method?: string | null;
      path?: string | null;
      operation_id?: string | null;
      handler_name?: string | null;
      start_line?: number | null;
      end_line?: number | null;
      decorators?: string[];
      request_shape?: Record<string, any> | null;
      response_shape?: Record<string, any> | null;
      meta?: Record<string, any>;
    }>,
  ): Promise<void>;

  insertEdges(
    documentId: number,
    rows: Array<{
      from_symbol_name?: string | null;
      edge_type: string;
      to_kind: string;
      to_value: string;
      start_line?: number | null;
      end_line?: number | null;
      meta?: Record<string, any>;
    }>,
  ): Promise<void>;

  insertFindings(
    documentId: number,
    rows: Array<{
      tool: string;
      rule_id: string;
      severity: string; // e.g., info | warn | error | high | critical
      message: string;
      start_line?: number | null;
      end_line?: number | null;
      fingerprint?: string | null;
      meta?: Record<string, any>;
    }>,
  ): Promise<void>;
}
