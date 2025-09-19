import "dotenv/config";
import pLimit from "p-limit";
import { app, asInstallation } from "../github"; // <-- your helpers
import { pool as db } from "../repo/pg";

// get installation id for a repo using App (JWT) auth
async function getInstallationId(repoFull: string): Promise<number | null> {
  const [owner, repo] = repoFull.split("/");
  try {
    const jwtOcto = app().octokit; // App-authenticated Octokit (JWT)
    const { data } = await jwtOcto.request(
      "GET /repos/{owner}/{repo}/installation",
      { owner, repo },
    );
    return data.id;
  } catch (e: any) {
    if (e.status === 404) return null; // app not installed or repo missing/private to app
    throw e;
  }
}

async function getHeadCommitSha(installationId: number, repoFull: string) {
  const [owner, repo] = repoFull.split("/");
  const inst = await asInstallation(installationId);
  const repoInfo = await inst.request("GET /repos/{owner}/{repo}", {
    owner,
    repo,
  });
  const branch = repoInfo.data.default_branch!;
  const head = await inst.request("GET /repos/{owner}/{repo}/commits/{ref}", {
    owner,
    repo,
    ref: branch,
  });
  return { branch, sha: head.data.sha as string };
}

async function fixRepo(repoFull: string) {
  const client = await db.connect();
  try {
    const installationId = await getInstallationId(repoFull);
    if (!installationId) {
      console.warn(`skip ${repoFull}: app not installed (404)`);
      return;
    }
    const head = await getHeadCommitSha(installationId, repoFull);

    await client.query("BEGIN");

    await client.query(
      `
      CREATE TEMP TABLE _keepers ON COMMIT DROP AS
      SELECT MIN(d.id) AS keep_id, d.repo_full, d.path
      FROM documents d
      WHERE d.repo_full = $1
      GROUP BY d.repo_full, d.path
      `,
      [repoFull],
    );

    await client.query(
      `
      UPDATE chunks AS c
      SET document_id = k.keep_id
      FROM documents AS d
      JOIN _keepers AS k
        ON k.repo_full = d.repo_full
       AND k.path      = d.path
      WHERE c.document_id = d.id
        AND d.repo_full   = $1
        AND c.document_id <> k.keep_id
      `,
      [repoFull],
    );

    await client.query(
      `
      DELETE FROM documents d
      USING _keepers k
      WHERE d.repo_full = $1
        AND d.path      = k.path
        AND d.id       <> k.keep_id
      `,
      [repoFull],
    );

    await client.query(
      `
      UPDATE documents d
      SET commit_sha = $2
      WHERE d.repo_full = $1
      `,
      [repoFull, head.sha],
    );

    await client.query("COMMIT");
    console.log(
      `✔ ${repoFull} -> ${head.sha.slice(0, 7)} (deduped per path, updated HEAD)`,
    );
  } catch (e: any) {
    await client.query("ROLLBACK");
    console.error(`✖ failed ${repoFull}:`, e?.message || e);
  } finally {
    client.release();
  }
}

async function main() {
  const { rows } = await db.query<{ repo_full: string }>(
    `SELECT DISTINCT repo_full FROM documents ORDER BY repo_full`,
  );

  const limit = pLimit(4);
  await Promise.all(rows.map((r) => limit(() => fixRepo(r.repo_full))));

  await db.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
