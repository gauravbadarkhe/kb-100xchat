// src/webhook.ts
import type { EmitterWebhookEvent } from "@octokit/webhooks";
import { onPush, onInstallation, onInstallationRepos } from "./sync";

export async function handleWebhook(e: EmitterWebhookEvent) {
  switch (e.name) {
    case "installation":
      return onInstallation(e);
    case "installation_repositories":
      return onInstallationRepos(e);
    case "push":
      return onPush(e);
    default:
      return;
  }
}
