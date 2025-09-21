import fs from "node:fs/promises";
import path from "node:path";
import { pool } from "../../repo/pg";

type EslintReport = Array<{
  filePath: string;
  messages: Array<{
    ruleId: string | null;
    severity: number; // 1 warn, 2 error
    message: string;
    line?: number;
    endLine?: number;
  }>;
}>;

export async function ingestEslintJson(jsonPath: string, repoFull: string) {
  const buf = await fs.readFile(jsonPath, "utf8");
  const data: EslintReport = JSON.parse(buf);
  for (const file of data) {
    const rel = toRepoRel(file.filePath, repoFull);
    if (!rel) continue;

    // map to document_id
    const { rows: drows } = await pool.query(
      `select id from documents where repo_full=$1 and path=$2 order by id desc limit 1`,
      [repoFull, rel],
    );
    const docId = drows[0]?.id ?? null;

    for (const m of file.messages) {
      const sev = m.severity === 2 ? "error" : "warn";
      await pool.query(
        `insert into findings (document_id, tool, rule_id, severity, message, start_line, end_line, fingerprint, meta)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          docId,
          "eslint",
          m.ruleId || "eslint",
          sev,
          m.message,
          m.line ?? null,
          m.endLine ?? m.line ?? null,
          null,
          {},
        ],
      );
    }
  }
}

function toRepoRel(absOrRel: string, repoFull: string) {
  // best-effort: if the path already matches a document path, use it
  const p = absOrRel.replace(/\\/g, "/");
  if (p.startsWith("/")) {
    // try to find a suffix that exists in documents
    return p.split("/").slice(-10).join("/"); // caller will match by exact path, ok if mismatch returns null
  }
  return p;
}
