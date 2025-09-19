// src/sync.ts
import type { EmitterWebhookEvent } from "@octokit/webhooks";
import { asInstallation } from "./github";
import { chunkMarkdown } from "./chunkers/markdown";
import { chunkCode } from "./chunkers/code";
import { embedBatch } from "./embeddings";
import crypto from "crypto";
import { makeIgnore } from "./gitignore";
import { chunkNestControllers } from "./chunkers/nest";
import { repos } from "./repo";

const BINARY_RE =
  /\.(png|jpg|jpeg|gif|pdf|zip|tgz|ico|woff2?|ttf|exe|dylib|so|jar)$/i;

export async function onInstallation(e: EmitterWebhookEvent<"installation">) {
  const { installation } = e.payload;
  console.log("installation", installation.id, installation.account?.login);
}

export async function onInstallationRepos(
  e: EmitterWebhookEvent<"installation_repositories">,
) {
  console.log(
    "repos added:",
    e.payload.repositories_added.map((r) => r.full_name),
  );
}

export async function onPush(e: EmitterWebhookEvent<"push">) {
  const installationId = e.payload.installation?.id;
  if (!installationId) return;

  const octo = await asInstallation(installationId);
  const fullName = e.payload.repository.full_name;
  const [owner, repo] = fullName.split("/");
  const base = e.payload.before;
  const head = e.payload.after;

  const { data } = await octo.request(
    "GET /repos/{owner}/{repo}/compare/{base}...{head}",
    { owner, repo, base, head },
  );

  const files = data.files || [];
  for (const f of files) {
    if (f.status === "removed") {
      // repo-layer delete
      await repos.documents.deleteByRepoPathCommit(fullName, f.filename, base);
      continue;
    }
    if (BINARY_RE.test(f.filename)) continue;
    await syncFile(octo, owner, repo, fullName, head, f.filename);
  }
}

async function syncFile(
  octo: any,
  owner: string,
  repo: string,
  repoFull: string,
  commitSha: string,
  path: string,
) {
  try {
    const file = await octo.request(
      "GET /repos/{owner}/{repo}/contents/{path}",
      { owner, repo, path, ref: commitSha },
    );
    if (!("content" in file.data)) return;

    const sha = (file.data as any).sha;
    const content = Buffer.from((file.data as any).content, "base64").toString(
      "utf8",
    );

    const isController = /controller\.ts$/i.test(path);
    const lang = languageFromPath(path);

    const chunks =
      lang === "md" || lang === "mdx"
        ? chunkMarkdown(content, path)
        : isController
          ? chunkNestControllers(content, path)
          : chunkCode(content, path, lang);

    // Upsert document via repo layer
    const doc = await repos.documents.upsert({
      repoFull,
      commitSha,
      path,
      lang,
      sha,
      blobSha: sha,
    });

    // Embed + replace chunks via repo layer
    const texts = chunks.map((c) => c.text);
    const vectors = await embedBatch(texts);

    const rows = chunks.map((c, i) => ({
      documentId: doc.id,
      ordinal: c.ordinal,
      text: c.text,
      meta: {
        path,
        lang,
        symbol: c.meta.symbol,
        title: c.meta.title,
        start_line: c.meta.start_line,
        end_line: c.meta.end_line,
        repo_full: repoFull,
        commit_sha: commitSha,
      },
      hash: hash(c.text),
      embedding: vectors[i] || [], // guard just in case
    }));

    await repos.chunks.replaceForDocument(doc.id, rows);

    console.log("synced", path, "chunks:", chunks.length);
  } catch (e: any) {
    console.error("syncFile err", path, e?.message);
  }
}

function languageFromPath(p: string) {
  const m = p.split(".").pop()?.toLowerCase();
  return m || "txt";
}
function hash(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

// src/sync.ts (helper)
async function getBranchHeadCommitSha(
  octo: any,
  owner: string,
  repo: string,
  branch: string,
) {
  const { data } = await octo.request(
    "GET /repos/{owner}/{repo}/commits/{ref}",
    {
      owner,
      repo,
      ref: branch,
    },
  );
  return data.sha; // <-- commit sha
}

// Get default branch + tree + root .gitignore
async function getRepoTree(octo: any, owner: string, repo: string) {
  const { data: repoInfo } = await octo.request("GET /repos/{owner}/{repo}", {
    owner,
    repo,
  });
  const branch = repoInfo.default_branch;

  const { data: tree } = await octo.request(
    "GET /repos/{owner}/{repo}/git/trees/{tree_sha}",
    { owner, repo, tree_sha: branch, recursive: "1" as any },
  );

  // try to load root .gitignore (ignore if missing)
  let rootGitignore = "";
  try {
    const file = await octo.request(
      "GET /repos/{owner}/{repo}/contents/{path}",
      { owner, repo, path: ".gitignore", ref: branch },
    );
    if ("content" in file.data) {
      rootGitignore = Buffer.from(
        (file.data as any).content,
        "base64",
      ).toString("utf8");
    }
  } catch (_) {}

  return { branch, tree, rootGitignore };
}

export async function fullSync(installationId: number, fullName: string) {
  const octo = await asInstallation(installationId);
  const [owner, repo] = fullName.split("/");

  const { branch, tree, rootGitignore } = await getRepoTree(octo, owner, repo);
  const ig = makeIgnore(rootGitignore);

  const entries = (tree.tree || []).filter((i: any) => i.type === "blob");

  // Optional: cap insane repos or big files fast
  const MAX_FILE_BYTES = 1.5 * 1024 * 1024; // 1.5 MB text cap
  const headCommitSha = await getBranchHeadCommitSha(octo, owner, repo, branch);

  for (const item of entries) {
    const path = item.path as string;

    // .gitignore filtering (root-level only for PoC)
    if (ig.ignores(path)) continue;

    // basic binary/size guards
    if (BINARY_RE.test(path)) continue;
    if (item.size && item.size > MAX_FILE_BYTES) continue;

    // fetch file contents at branch head
    try {
      const file = await octo.request(
        "GET /repos/{owner}/{repo}/contents/{path}",
        { owner, repo, path, ref: branch },
      );
      if (!("content" in file.data)) continue;

      const content = Buffer.from(
        (file.data as any).content,
        "base64",
      ).toString("utf8");
      const lang = languageFromPath(path);
      const fileSha = (file.data as any).sha;

      // Upsert document via repo layer
      const doc = await repos.documents.upsert({
        repoFull: fullName,
        commitSha: headCommitSha,
        path,
        lang,
        sha: fileSha,
        blobSha: fileSha,
      });

      const chunks =
        lang === "md" || lang === "mdx"
          ? chunkMarkdown(content, path)
          : /controller\.ts$/i.test(path)
            ? chunkNestControllers(content, path)
            : chunkCode(content, path, lang);

      const texts = chunks.map((c) => c.text);
      const vectors = await embedBatch(texts);

      const rows = chunks.map((c, i) => ({
        documentId: doc.id,
        ordinal: c.ordinal,
        text: c.text,
        meta: {
          path,
          lang,
          symbol: c.meta.symbol,
          title: c.meta.title,
          start_line: c.meta.start_line,
          end_line: c.meta.end_line,
          repo_full: fullName,
          commit_sha: fileSha,
        },
        hash: hash(c.text),
        embedding: vectors[i] || [],
      }));

      await repos.chunks.replaceForDocument(doc.id, rows);

      console.log("indexed", path);
    } catch (e: any) {
      // Files can disappear between tree and getContent, or be too large; skip quietly
      console.warn("skip", path, e?.status || e?.message);
    }
  }

  console.log(`full sync complete for ${fullName}@${branch}`);
}
