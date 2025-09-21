// src/webhook/handlers.ts
import type { EmitterWebhookEvent } from "@octokit/webhooks";
import { sourcesRepo } from "@/src/auth/repositories";
import { onPush as syncOnPush, onInstallation as syncOnInstallation, onInstallationRepos as syncOnInstallationRepos } from "../sync";

/**
 * Enhanced webhook handlers that integrate with the source management system
 */

export async function handleInstallationEvent(e: EmitterWebhookEvent<"installation">) {
  console.log("Installation event:", e.payload.action, e.payload.installation.id);
  
  // Handle the installation at the sync level first
  await syncOnInstallation(e);
  
  if (e.payload.action === 'created') {
    // When a new installation is created, we could automatically create sources
    // for the repositories that the app has access to
    console.log(`GitHub App installed by ${e.payload.installation.account?.login}`);
    
    // Note: We don't automatically create sources here since users need to
    // select specific repositories through our UI and associate them with their organization
  } else if (e.payload.action === 'deleted') {
    // When installation is deleted, mark related sources as inactive
    await handleInstallationDeleted(e.payload.installation.id);
  }
}

export async function handleInstallationRepositoriesEvent(e: EmitterWebhookEvent<"installation_repositories">) {
  console.log("Installation repositories event:", e.payload.action);
  
  // Handle at sync level first
  await syncOnInstallationRepos(e);
  
  if (e.payload.action === 'added') {
    console.log("Repositories added:", e.payload.repositories_added.map(r => r.full_name));
    // New repositories were added to the installation
    // Users can now select these through the UI
  } else if (e.payload.action === 'removed') {
    console.log("Repositories removed:", e.payload.repositories_removed.map(r => r.full_name));
    // Repositories were removed from the installation
    await handleRepositoriesRemoved(e.payload.installation.id, e.payload.repositories_removed);
  }
}

export async function handlePushEvent(e: EmitterWebhookEvent<"push">) {
  const installationId = e.payload.installation?.id;
  const repositoryFullName = e.payload.repository.full_name;
  
  console.log(`Push event for ${repositoryFullName} (installation: ${installationId})`);
  
  // Handle at sync level first (this does the actual content syncing)
  await syncOnPush(e);
  
  // Update source sync status in our database
  if (installationId) {
    await updateSourceSyncStatus(installationId, repositoryFullName, 'completed');
  }
}

/**
 * Mark sources as inactive when installation is deleted
 */
async function handleInstallationDeleted(installationId: number) {
  try {
    // Find all sources with this installation_id and mark them as inactive
    const sources = await sourcesRepo.findAll({
      filters: [
        { field: 'type', operator: '=', value: 'github' },
        { field: 'is_active', operator: '=', value: true }
      ]
    });
    
    for (const source of sources) {
      if (source.config.installation_id === installationId) {
        await sourcesRepo.update(source.id, {
          is_active: false
        });
        console.log(`Deactivated source ${source.name} due to installation removal`);
      }
    }
  } catch (error) {
    console.error('Error handling installation deletion:', error);
  }
}

/**
 * Handle repositories being removed from installation
 */
async function handleRepositoriesRemoved(installationId: number, repositories: any[]) {
  try {
    const repoNames = repositories.map(r => r.full_name);
    
    // Find sources for these repositories and mark them as inactive
    const sources = await sourcesRepo.findAll({
      filters: [
        { field: 'type', operator: '=', value: 'github' },
        { field: 'is_active', operator: '=', value: true }
      ]
    });
    
    for (const source of sources) {
      if (source.config.installation_id === installationId && 
          repoNames.includes(source.config.repository)) {
        await sourcesRepo.update(source.id, {
          is_active: false
        });
        console.log(`Deactivated source ${source.name} due to repository removal`);
      }
    }
  } catch (error) {
    console.error('Error handling repository removal:', error);
  }
}

/**
 * Update source sync status after sync operations
 */
async function updateSourceSyncStatus(installationId: number, repositoryFullName: string, status: 'completed' | 'failed', error?: string) {
  try {
    // Find the source for this repository
    const sources = await sourcesRepo.findAll({
      filters: [
        { field: 'type', operator: '=', value: 'github' },
        { field: 'is_active', operator: '=', value: true }
      ]
    });
    
    const source = sources.find(s => 
      s.config.installation_id === installationId && 
      s.config.repository === repositoryFullName
    );
    
    if (source) {
      // Update sync status via direct API call to handle additional fields
      try {
        const updateResponse = await fetch(`/api/sources/${source.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            // Only update basic fields that are allowed in UpdateSourceInput
            name: source.name
          })
        });
        // Note: sync_status, last_synced_at, and sync_error updates would need dedicated endpoints
        console.log(`Attempted to update sync status for source ${source.name}: ${status}`);
      } catch (updateError) {
        console.error('Failed to update source via API:', updateError);
      }
      console.log(`Updated sync status for source ${source.name}: ${status}`);
    }
  } catch (error) {
    console.error('Error updating source sync status:', error);
  }
}

/**
 * Trigger initial sync for a newly created GitHub source
 */
export async function triggerInitialSync(source: any) {
  if (source.type !== 'github' || !source.config.installation_id) {
    return;
  }
  
  try {
    // Update status to syncing
    // Note: sync_status updates would need a dedicated endpoint
    console.log(`Starting sync for source ${source.name}`);
    
    // Import and use the fullSync function
    const { fullSync } = await import('../sync');
    await fullSync(source.config.installation_id, source.config.repository);
    
    // Update status to completed
    // Note: sync_status updates would need a dedicated endpoint
    console.log(`Completed sync for source ${source.name}`);
    
    console.log(`Initial sync completed for source ${source.name}`);
  } catch (error: any) {
    console.error(`Initial sync failed for source ${source.name}:`, error);
    
    // Update status to failed
    // Note: sync_status updates would need a dedicated endpoint
    console.log(`Failed sync for source ${source.name}: ${error.message}`);
  }
}
