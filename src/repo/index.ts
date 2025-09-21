// src/repo/index.ts
import {
  PgDocumentsRepository,
  PgChunksRepository,
  PgSearchRepository,
} from "./pgRepositories";
import type { Repositories } from "./interfaces";
import { AnalysisRepo } from "./analysisRepo";

export const repos: Repositories = {
  documents: new PgDocumentsRepository(),
  chunks: new PgChunksRepository(),
  search: new PgSearchRepository(),
  analysis: new AnalysisRepo(),
};
