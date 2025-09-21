import { pool } from "../repo/pg";
import { embedBatch, toPgVectorLiteral } from "../embeddings";

function endpointFactsheet(e: any, doc: any) {
  return [
    `KIND: endpoint`,
    `LANG: ${e.language}`,
    `FILE: ${doc.path}`,
    `SPAN: L${e.start_line}-${e.end_line}`,
    `ROUTE: ${e.method || "ALL"} ${e.path || "/"}`,
    `HANDLER: ${e.handler_name || ""}`,
    e.request_shape ? `REQUEST: ${jsonCompact(e.request_shape)}` : null,
    e.response_shape ? `RESPONSE: ${jsonCompact(e.response_shape)}` : null,
    e.decorators?.length ? `DECORATORS: ${e.decorators.join(",")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function symbolFactsheet(s: any, doc: any) {
  return [
    `KIND: ${s.kind}`,
    `LANG: ${s.language}`,
    `NAME: ${s.name}`,
    `FILE: ${doc.path}`,
    s.start_line && s.end_line ? `SPAN: L${s.start_line}-${s.end_line}` : null,
    s.signature ? `SIGNATURE: ${oneLine(s.signature, 300)}` : null,
    s.meta?.shape ? `SHAPE: ${jsonCompact(s.meta.shape)}` : null,
    s.modifiers ? `MODIFIERS: ${jsonCompact(s.modifiers)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function upsertFactsheetsForDocument(documentId: number) {
  const {
    rows: [doc],
  } = await pool.query(
    `select d.id, d.repo_full, d.commit_sha, d.path from documents d where d.id=$1`,
    [documentId],
  );
  if (!doc) return;

  const { rows: endpoints } = await pool.query(
    `select * from endpoints where document_id=$1`,
    [documentId],
  );
  const { rows: symbols } = await pool.query(
    `select * from symbols where document_id=$1`,
    [documentId],
  );

  const texts: string[] = [];
  const metas: any[] = [];

  for (const e of endpoints) {
    texts.push(endpointFactsheet(e, doc));
    metas.push({
      kind: "factsheet",
      subtype: "endpoint",
      path: doc.path,
      repo_full: doc.repo_full,
      commit_sha: doc.commit_sha,
      start_line: e.start_line,
      end_line: e.end_line,
      symbol: e.handler_name,
      title: `${e.method || "ALL"} ${e.path || "/"}`,
    });
  }

  for (const s of symbols) {
    texts.push(symbolFactsheet(s, doc));
    metas.push({
      kind: "factsheet",
      subtype: "symbol",
      path: doc.path,
      repo_full: doc.repo_full,
      commit_sha: doc.commit_sha,
      start_line: s.start_line,
      end_line: s.end_line,
      symbol: s.name,
      title: `${s.kind}:${s.name}`,
    });
  }

  if (!texts.length) return;

  const vecs = await embedBatch(texts);

  await pool.query(
    `delete from chunks where document_id=$1 and (meta->>'kind')='factsheet'`,
    [documentId],
  );

  for (let i = 0; i < texts.length; i++) {
    await pool.query(
      `insert into chunks (document_id, ordinal, text, meta, hash, embedding)
       values ($1,$2,$3,$4,$5,$6::vector)`,
      [
        documentId,
        i,
        texts[i],
        JSON.stringify(metas[i]),
        `${documentId}:factsheet:${i}`,
        toPgVectorLiteral(vecs[i]),
      ],
    );
  }
}

function oneLine(s: string, max = 400) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max) + " …" : t;
}
function jsonCompact(o: any, max = 400) {
  const t = JSON.stringify(o);
  return t.length > max ? t.slice(0, max) + " …" : t;
}
