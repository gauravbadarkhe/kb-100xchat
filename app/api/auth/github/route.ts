import { NextRequest, NextResponse } from 'next/server';
import { withAuth, createErrorResponse, createSuccessResponse } from '@/src/auth/middleware';
import { app } from '@/src/github';

// GET /api/auth/github - Initiate GitHub OAuth flow
export const GET = withAuth(async (request) => {
  try {
    const { authContext } = request;
    const url = new URL(request.url);
    const installationId = url.searchParams.get('installation_id');
    const setupAction = url.searchParams.get('setup_action');
    
    if (setupAction === 'install' && installationId) {
      // Handle GitHub App installation completion
      return handleGitHubAppInstallation(installationId, authContext.organization_id, authContext.user_id);
    }

    // Generate GitHub App installation URL
    const githubApp = app();
    const installationUrl = `https://github.com/apps/tnega-ai-poc/installations/new`;
    
    return createSuccessResponse({
      installation_url: installationUrl,
      state: `org_${authContext.organization_id}_user_${authContext.user_id}`
    });
    
  } catch (error: any) {
    console.error('GitHub auth error:', error);
    return createErrorResponse('Failed to initiate GitHub authentication', 500, error.message);
  }
});

async function handleGitHubAppInstallation(
  installationId: string, 
  organizationId: number, 
  userId: number
) {
  try {
    const githubApp = app();
    const octokit = await githubApp.getInstallationOctokit(parseInt(installationId));
    
    // Get installation details
    const { data: installation } = await octokit.request('GET /app/installations/{installation_id}', {
      installation_id: parseInt(installationId)
    });
    
    // Get accessible repositories
    const { data: repos } = await octokit.request('GET /installation/repositories');
    
    return createSuccessResponse({
      installation_id: installationId,
      account: installation.account,
      repositories: repos.repositories.map(repo => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description,
        private: repo.private,
        default_branch: repo.default_branch
      })),
      permissions: installation.permissions
    });
    
  } catch (error: any) {
    console.error('GitHub App installation error:', error);
    return createErrorResponse('Failed to process GitHub App installation', 500, error.message);
  }
}
