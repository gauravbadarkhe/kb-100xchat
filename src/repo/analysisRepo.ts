import { pool } from "./pg";

export class AnalysisRepo {
  constructor() {}

  async clearForDocument(documentId: number) {
    await pool.query(`delete from symbols where document_id=$1`, [documentId]);
    await pool.query(`delete from endpoints where document_id=$1`, [
      documentId,
    ]);
    await pool.query(`delete from edges where from_document_id=$1`, [
      documentId,
    ]);
    await pool.query(`delete from findings where document_id=$1`, [documentId]);
  }

  async insertSymbols(
    documentId: number,
    rows: Array<{
      language: string;
      kind: string;
      name: string;
      signature?: string;
      start_line?: number;
      end_line?: number;
      modifiers?: any;
      meta?: any;
    }>,
  ) {
    if (!rows.length) return;
    const sql = `insert into symbols
      (document_id, language, kind, name, signature, start_line, end_line, modifiers, meta)
      values ${rows.map((_, i) => `($1,$${i * 8 + 2},$${i * 8 + 3},$${i * 8 + 4},$${i * 8 + 5},$${i * 8 + 6},$${i * 8 + 7},$${i * 8 + 8},$${i * 8 + 9})`).join(",")}`;
    const args = rows.flatMap((r) => [
      r.language,
      r.kind,
      r.name,
      r.signature ?? null,
      r.start_line ?? null,
      r.end_line ?? null,
      r.modifiers ?? {},
      r.meta ?? {},
    ]);
    await pool.query(sql, [documentId, ...args]);
  }

  async insertEndpoints(
    documentId: number,
    rows: Array<{
      language: string;
      protocol?: string;
      method?: string | null;
      path?: string | null;
      operation_id?: string | null;
      handler_name?: string | null;
      start_line?: number;
      end_line?: number;
      decorators?: any[];
      request_shape?: any;
      response_shape?: any;
      meta?: any;
    }>,
  ) {
    if (!rows.length) return;
    const sql = `insert into endpoints
      (document_id, language, protocol, method, path, operation_id, handler_name, start_line, end_line, decorators, request_shape, response_shape, meta)
      values ${rows.map((_, i) => `($1,$${i * 12 + 2},$${i * 12 + 3},$${i * 12 + 4},$${i * 12 + 5},$${i * 12 + 6},$${i * 12 + 7},$${i * 12 + 8},$${i * 12 + 9},$${i * 12 + 10},$${i * 12 + 11},$${i * 12 + 12},$${i * 12 + 13})`).join(",")}`;
    const args = rows.flatMap((r) => [
      r.language,
      r.protocol ?? "http",
      r.method ?? null,
      r.path ?? null,
      r.operation_id ?? null,
      r.handler_name ?? null,
      r.start_line ?? null,
      r.end_line ?? null,
      r.decorators ?? [],
      r.request_shape ?? null,
      r.response_shape ?? null,
      r.meta ?? {},
    ]);
    await pool.query(sql, [documentId, ...args]);
  }

  async insertEdges(
    documentId: number,
    rows: Array<{
      from_symbol_name?: string | null;
      edge_type: string;
      to_kind: string;
      to_value: string;
      start_line?: number;
      end_line?: number;
      meta?: any;
    }>,
  ) {
    if (!rows.length) return;
    const sql = `insert into edges
      (from_document_id, from_symbol_name, edge_type, to_kind, to_value, start_line, end_line, meta)
      values ${rows.map((_, i) => `($1,$${i * 7 + 2},$${i * 7 + 3},$${i * 7 + 4},$${i * 7 + 5},$${i * 7 + 6},$${i * 7 + 7},$${i * 7 + 8})`).join(",")}`;
    const args = rows.flatMap((r) => [
      r.from_symbol_name ?? null,
      r.edge_type,
      r.to_kind,
      r.to_value,
      r.start_line ?? null,
      r.end_line ?? null,
      r.meta ?? {},
    ]);
    await pool.query(sql, [documentId, ...args]);
  }

  async insertFindings(
    documentId: number,
    rows: Array<{
      tool: string;
      rule_id: string;
      severity: string;
      message: string;
      start_line?: number;
      end_line?: number;
      fingerprint?: string | null;
      meta?: any;
    }>,
  ) {
    if (!rows.length) return;
    const sql = `insert into findings
      (document_id, tool, rule_id, severity, message, start_line, end_line, fingerprint, meta)
      values ${rows.map((_, i) => `($1,$${i * 8 + 2},$${i * 8 + 3},$${i * 8 + 4},$${i * 8 + 5},$${i * 8 + 6},$${i * 8 + 7},$${i * 8 + 8},$${i * 8 + 9})`).join(",")}`;
    const args = rows.flatMap((r) => [
      r.tool,
      r.rule_id,
      r.severity,
      r.message,
      r.start_line ?? null,
      r.end_line ?? null,
      r.fingerprint ?? null,
      r.meta ?? {},
    ]);
    await pool.query(sql, [documentId, ...args]);
  }
}
