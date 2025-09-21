import { pool as db } from "./repo/pg";
import type { Retrieved } from "./reterival";

type Facts = {
  endpoints: Array<{
    repo: string;
    path: string;
    method: string | null;
    route: string | null;
    handler: string | null;
    start?: number | null;
    end?: number | null;
  }>;
  symbols: Array<{
    repo: string;
    path: string;
    kind: string;
    name: string;
    start?: number | null;
    end?: number | null;
  }>;
  edges: Array<{
    repo: string;
    path: string;
    edge_type: string;
    to_kind: string;
    to_value: string;
    start?: number | null;
    end?: number | null;
  }>;
  findings: Array<{
    repo: string;
    path: string;
    severity: string;
    rule_id: string;
    message: string;
    start?: number | null;
    end?: number | null;
  }>;
};

export async function collectFacts(top: Retrieved[]): Promise<Facts> {
  if (!top.length)
    return { endpoints: [], symbols: [], edges: [], findings: [] };
  const docIds = [...new Set(top.map((t) => t.document_id))];
  const repos = new Map<number, string>();
  const paths = new Map<number, string>();
  const commits = new Map<number, string>();

  const docs = await db.query(
    `select id, repo_full, path, commit_sha from documents where id = ANY($1)`,
    [docIds],
  );
  for (const d of docs.rows) {
    repos.set(d.id, d.repo_full);
    paths.set(d.id, d.path);
    commits.set(d.id, d.commit_sha);
  }

  const [eps, syms, eds, fnds] = await Promise.all([
    db.query(
      `select document_id, method, path as route, handler_name, start_line, end_line from endpoints where document_id = ANY($1) limit 500`,
      [docIds],
    ),
    db.query(
      `select document_id, kind, name, start_line, end_line from symbols where document_id = ANY($1) limit 800`,
      [docIds],
    ),
    db.query(
      `select from_document_id as document_id, edge_type, to_kind, to_value, start_line, end_line from edges where from_document_id = ANY($1) limit 800`,
      [docIds],
    ),
    db.query(
      `select document_id, severity, rule_id, message, start_line, end_line from findings where document_id = ANY($1) and severity in ('error','high','critical') limit 400`,
      [docIds],
    ),
  ]);

  const endpoints = eps.rows.map((r: any) => ({
    repo: repos.get(r.document_id)!,
    path: paths.get(r.document_id)!,
    method: r.method,
    route: r.route,
    handler: r.handler_name,
    start: r.start_line,
    end: r.end_line,
  }));
  const symbols = syms.rows.map((r: any) => ({
    repo: repos.get(r.document_id)!,
    path: paths.get(r.document_id)!,
    kind: r.kind,
    name: r.name,
    start: r.start_line,
    end: r.end_line,
  }));
  const edges = eds.rows.map((r: any) => ({
    repo: repos.get(r.document_id)!,
    path: paths.get(r.document_id)!,
    edge_type: r.edge_type,
    to_kind: r.to_kind,
    to_value: r.to_value,
    start: r.start_line,
    end: r.end_line,
  }));
  const findings = fnds.rows.map((r: any) => ({
    repo: repos.get(r.document_id)!,
    path: paths.get(r.document_id)!,
    severity: r.severity,
    rule_id: r.rule_id,
    message: r.message,
    start: r.start_line,
    end: r.end_line,
  }));

  return { endpoints, symbols, edges, findings };
}

export function buildPrompt(question: string, top: Retrieved[], facts: Facts) {
  const srcList = top.map((s, i) => `[${i + 1}] ${s.link}`).join("\n");

  const ctx = top
    .map((s, i) => {
      const metaLine = [
        `${s.repo}/${s.path}`,
        s.symbol ? `· ${s.symbol}` : null,
        s.start_line
          ? `· L${s.start_line}${s.end_line ? `-${s.end_line}` : ""}`
          : null,
        s.link,
      ]
        .filter(Boolean)
        .join(" ");
      const body =
        s.preview?.length > 1600
          ? s.preview.slice(0, 1600) + "\n…"
          : s.preview || "";
      return `SOURCE [${i + 1}] ${metaLine}\n----\n${body}`;
    })
    .join("\n\n");

  // compact FACTS tables
  const factsText = [
    facts.endpoints.length
      ? "ENDPOINTS:\n" +
        facts.endpoints
          .slice(0, 30)
          .map(
            (e) =>
              `- ${e.method || "ALL"} ${e.route || "/"} → ${e.handler || ""} @ ${e.repo}/${e.path}${e.start ? ` L${e.start}-${e.end || e.start}` : ""}`,
          )
          .join("\n")
      : null,
    facts.edges.length
      ? "EDGES:\n" +
        facts.edges
          .slice(0, 40)
          .map(
            (e) =>
              `- ${e.edge_type} → ${e.to_kind}:${e.to_value} @ ${e.repo}/${e.path}${e.start ? ` L${e.start}-${e.end || e.start}` : ""}`,
          )
          .join("\n")
      : null,
    facts.findings.length
      ? "FINDINGS (high+):\n" +
        facts.findings
          .slice(0, 20)
          .map(
            (f) =>
              `- ${f.severity} ${f.rule_id}: ${f.message} @ ${f.repo}/${f.path}${f.start ? ` L${f.start}-${f.end || f.start}` : ""}`,
          )
          .join("\n")
      : null,
    facts.symbols.length
      ? "SYMBOLS:\n" +
        facts.symbols
          .slice(0, 40)
          .map(
            (s) =>
              `- ${s.kind} ${s.name} @ ${s.repo}/${s.path}${s.start ? ` L${s.start}-${s.end || s.start}` : ""}`,
          )
          .join("\n")
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const system =
    `You are a senior engineer. Answer ONLY with facts grounded in sources.\n` +
    `Rules:\n` +
    `- Cite with [n] markers, where n matches SOURCES.\n` +
    `- Prefer short code snippets (≤30 lines) and concrete steps.\n` +
    `- If missing info, say "Not enough information in the provided sources."`;

  const user =
    `QUESTION:\n${question}\n\n` +
    (factsText ? `FACTS (from analysis):\n${factsText}\n\n` : "") +
    `SOURCES (clickable):\n${srcList}\n\n` +
    `CONTEXT:\n${ctx}\n\n` +
    `RESPONSE FORMAT (JSON):\n{\n  "answer": "markdown with [n] citations",\n  "citations": [\n    {"link":"<url>","repo":"<org/repo>","path":"<file>","start_line":10,"end_line":30}\n  ]\n}`;

  return { system, user };
}
