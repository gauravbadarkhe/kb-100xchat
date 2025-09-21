import fs from "node:fs/promises";
import { pool } from "../../repo/pg";

type SemgrepFinding = {
  check_id: string;
  path: string;
  start: { line: number };
  end?: { line: number };
  extra?: { message?: string; severity?: string; fingerprint?: string };
};
type SemgrepJson = { results: SemgrepFinding[] };

export async function ingestSemgrepJson(jsonPath: string, repoFull: string) {
  const buf = await fs.readFile(jsonPath, "utf8");
  const data: SemgrepJson = JSON.parse(buf);
  for (const f of data.results || []) {
    const rel = f.path.replace(/\\/g, "/");
    const { rows: drows } = await pool.query(
      `select id from documents where repo_full=$1 and path=$2 order by id desc limit 1`,
      [repoFull, rel],
    );
    const docId = drows[0]?.id ?? null;
    await pool.query(
      `insert into findings (document_id, tool, rule_id, severity, message, start_line, end_line, fingerprint, meta)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        docId,
        "semgrep",
        f.check_id,
        (f.extra?.severity || "warn").toLowerCase(),
        f.extra?.message || "",
        f.start?.line ?? null,
        f.end?.line ?? f.start?.line ?? null,
        f.extra?.fingerprint ?? null,
        {},
      ],
    );
  }
}
