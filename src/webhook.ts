// src/webhook.ts
import type { EmitterWebhookEvent } from "@octokit/webhooks";
import { 
  handleInstallationEvent, 
  handleInstallationRepositoriesEvent, 
  handlePushEvent 
} from "./webhook/handlers";

export async function handleWebhook(e: EmitterWebhookEvent) {
  try {
    switch (e.name) {
      case "installation":
        return await handleInstallationEvent(e);
      case "installation_repositories":
        return await handleInstallationRepositoriesEvent(e);
      case "push":
        return await handlePushEvent(e);
      default:
        console.log(`Unhandled webhook event: ${e.name}`);
        return;
    }
  } catch (error) {
    console.error(`Error handling webhook event ${e.name}:`, error);
    throw error;
  }
}
