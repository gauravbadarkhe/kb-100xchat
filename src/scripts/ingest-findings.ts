import "dotenv/config";
import { ingestEslintJson } from "../analysis/findings/eslint";
import { ingestSemgrepJson } from "../analysis/findings/semgrep";

const [, , kind, jsonPath, repoFull] = process.argv;
if (!kind || !jsonPath || !repoFull) {
  console.error(
    "Usage: tsx src/scripts/ingest-findings.ts <eslint|semgrep> <path-to-json> <org/repo>",
  );
  process.exit(1);
}
(async () => {
  if (kind === "eslint") await ingestEslintJson(jsonPath, repoFull);
  else if (kind === "semgrep") await ingestSemgrepJson(jsonPath, repoFull);
  else throw new Error("unknown kind");
  console.log("ingested", kind, jsonPath, "for", repoFull);
})();
