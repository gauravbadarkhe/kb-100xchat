import { extractNestEndpoints } from "./ts/nestEndpoints";
import { extractTsEdges } from "./ts/edges";
import { extractTsSymbols } from "./ts/symbols";
import { extractTsTypeShapes } from "./ts/tsShapes";
import { repos } from "../repo";
const analysisRepo = repos.analysis;
export async function persistAnalysis({
  documentId,
  path,
  lang,
  content,
}: {
  documentId: number;
  path: string;
  lang: string;
  content: string;
}) {
  if (!/(ts|tsx)$/.test(lang)) return;

  // clear previous for this document
  await analysisRepo.clearForDocument(documentId);

  // endpoints (Nest)
  const endpoints = /controller\.ts$/i.test(path)
    ? extractNestEndpoints(path, content)
    : [];

  // edges (pubsub/http)
  const edges = extractTsEdges(path, content);

  // symbols (functions/classes/methods/interfaces/types/enums)
  const symbols = extractTsSymbols(path, content);

  // type shapes -> fold into symbols.meta.shape (keeps schema small)
  const shapes = extractTsTypeShapes(path, content);
  // attach shapes to matching symbol rows when names collide (interface/type)
  const symbolRows = symbols.map((s) => {
    const shape = shapes.find(
      (t) =>
        t.name === s.name &&
        (t.kind === "interface" || t.kind === "type" || t.kind === "enum"),
    );
    return shape
      ? {
          ...s,
          meta: {
            ...(s.meta || {}),
            shape: shape.shape,
            shape_kind: shape.kind,
          },
        }
      : s;
  });

  await analysisRepo.insertEndpoints(
    documentId,
    endpoints.map((e) => ({ ...e, language: "ts" })),
  );
  await analysisRepo.insertEdges(documentId, edges);
  await analysisRepo.insertSymbols(documentId, symbolRows);
}
