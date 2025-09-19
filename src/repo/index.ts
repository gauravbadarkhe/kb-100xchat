// src/repo/index.ts
import {
  PgDocumentsRepository,
  PgChunksRepository,
  PgSearchRepository,
} from "./pgRepositories";
import type { Repositories } from "./interfaces";

export const repos: Repositories = {
  documents: new PgDocumentsRepository(),
  chunks: new PgChunksRepository(),
  search: new PgSearchRepository(),
};
