import { NextRequest, NextResponse } from 'next/server';
import { withAuth, createErrorResponse, createSuccessResponse } from '@/src/auth/middleware';
import { app } from '@/src/github';
import { z } from 'zod';

const GetRepositoriesSchema = z.object({
  installation_id: z.string().min(1, 'Installation ID is required'),
});

// GET /api/sources/github/repositories - Get accessible repositories for an installation
export const GET = withAuth(async (request) => {
  try {
    const url = new URL(request.url);
    const installationId = url.searchParams.get('installation_id');
    
    const validation = GetRepositoriesSchema.safeParse({ installation_id: installationId });
    if (!validation.success) {
      return createErrorResponse('Invalid parameters', 400, JSON.stringify(validation.error.issues));
    }

    const { installation_id } = validation.data;

    const githubApp = app();
    const octokit = await githubApp.getInstallationOctokit(parseInt(installation_id));
    
    // Get installation details
    const { data: installation } = await octokit.request('GET /app/installations/{installation_id}', {
      installation_id: parseInt(installation_id)
    });
    
    // Get accessible repositories
    const { data: repos } = await octokit.request('GET /installation/repositories');
    
    const repositories = repos.repositories.map(repo => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      description: repo.description,
      private: repo.private,
      default_branch: repo.default_branch,
      language: repo.language,
      size: repo.size,
      updated_at: repo.updated_at
    }));

    return createSuccessResponse({
      installation: {
        id: installation.id,
        account: installation.account,
        app_slug: installation.app_slug,
        permissions: installation.permissions
      },
      repositories,
      total_count: repos.total_count
    });
    
  } catch (error: any) {
    console.error('Get GitHub repositories error:', error);
    return createErrorResponse('Failed to fetch GitHub repositories', 500, error.message);
  }
});
