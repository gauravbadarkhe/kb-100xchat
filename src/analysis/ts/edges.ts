import { Project } from "ts-morph";

export function extractTsEdges(path: string, content: string) {
  const project = new Project({ useInMemoryFileSystem: true });
  const sf = project.createSourceFile(path, content, { overwrite: true });

  const edges: any[] = [];

  // Heuristic string searches (cheap & robust); we also capture line numbers by scanning the text.
  const text = sf.getFullText().split(/\r?\n/);

  function pushEdge(
    lineIdx: number,
    edge_type: string,
    to_kind: string,
    to_value: string,
    meta: any = {},
  ) {
    edges.push({
      from_symbol_name: null,
      edge_type,
      to_kind,
      to_value,
      start_line: lineIdx + 1,
      end_line: Math.min(lineIdx + 1, text.length),
      meta,
    });
  }

  // PubSub / Kafka / BullMQ (basic signatures)
  text.forEach((line, i) => {
    // GCP PubSub
    const m1 = line.match(/\.topic\((['"`])([^'"`]+)\1\)\.publish/);
    if (m1)
      pushEdge(i, "pubsub.publish", "topic", m1[2], { lib: "gcp_pubsub" });

    // Kafka
    const m2 = line.match(
      /producer\.send\(\s*{[^}]*topic:\s*(['"`])([^'"`]+)\1/,
    );
    if (m2) pushEdge(i, "pubsub.publish", "topic", m2[2], { lib: "kafka" });

    // BullMQ publish
    const m3 = line.match(/new\s+Queue\((['"`])([^'"`]+)\1/);
    if (m3) pushEdge(i, "pubsub.publish", "queue", m3[2], { lib: "bullmq" });

    // BullMQ processor
    const m4 = line.match(/@Processor\((['"`])([^'"`]+)\1/);
    if (m4) pushEdge(i, "pubsub.consume", "queue", m4[2], { lib: "bullmq" });
  });

  // HTTP calls (axios/fetch/Nest HttpService)
  text.forEach((line, i) => {
    // axios('METHOD', url) / axios.post(url)
    const mx1 = line.match(
      /axios\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\2/,
    );
    if (mx1)
      pushEdge(i, "http.call", "url", mx1[3], {
        method: mx1[1].toUpperCase(),
        lib: "axios",
      });

    const mx2 = line.match(
      /fetch\(\s*(['"`])([^'"`]+)\1\s*,\s*{[^}]*method:\s*(['"`])([A-Z]+)\3/,
    );
    if (mx2)
      pushEdge(i, "http.call", "url", mx2[2], { method: mx2[4], lib: "fetch" });

    const mx3 = line.match(
      /this\.httpService\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\2/,
    );
    if (mx3)
      pushEdge(i, "http.call", "url", mx3[3], {
        method: mx3[1].toUpperCase(),
        lib: "nest-http",
      });
  });

  return edges;
}
