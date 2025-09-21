export function groupPathsByRepo(paths: string[]) {
  // input accepts "org/repo:path" or "org/repo::path" or just "path" (falls back to wildcard)
  const map: Record<string, string[]> = {};
  for (const raw of paths) {
    const m = raw.match(/^([^:]+\/[^:]+)[:]{1,2}(.*)$/);
    if (m) {
      const repoFull = m[1];
      const p = m[2];
      map[repoFull] ??= [];
      map[repoFull].push(p);
    } else {
      map["*"] ??= [];
      map["*"].push(raw);
    }
  }
  return map;
}
