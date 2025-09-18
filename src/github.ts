import { App } from "@octokit/app";

function normalizeKey(k: string) {
  // if the key is in a single-line env var with \n, fix it
  return k.includes("\\n") ? k.replace(/\\n/g, "\n") : k;
}

export function app() {
  return new App({
    appId: process.env.GITHUB_APP_ID!,
    privateKey: normalizeKey(process.env.GITHUB_APP_PRIVATE_KEY!),
    // oauth client is optional for this flow; you can omit if unused
  });
}

export async function asInstallation(installationId: number) {
  const a = app();
  // ✅ This returns an authenticated Octokit for that installation
  return await a.getInstallationOctokit(installationId);
}
