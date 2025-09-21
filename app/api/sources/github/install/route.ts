import { NextRequest, NextResponse } from 'next/server';
import { withAuth, createErrorResponse, createSuccessResponse } from '@/src/auth/middleware';
import { sourcesRepo } from '@/src/auth/repositories';
import { app } from '@/src/github';
import { z } from 'zod';

const ProcessInstallationSchema = z.object({
  installation_id: z.number(),
  repositories: z.array(z.object({
    id: z.number(),
    name: z.string(),
    full_name: z.string(),
    description: z.string().optional(),
    private: z.boolean(),
    default_branch: z.string()
  }))
});

// POST /api/sources/github/install - Process GitHub App installation and create sources
export const POST = withAuth(async (request) => {
  try {
    const { authContext } = request;
    const body = await request.json();
    
    const validation = ProcessInstallationSchema.safeParse(body);
    if (!validation.success) {
      return createErrorResponse('Invalid input', 400, JSON.stringify(validation.error.issues));
    }

    const { installation_id, repositories } = validation.data;

    // Verify installation access
    const githubApp = app();
    const octokit = await githubApp.getInstallationOctokit(installation_id);
    
    // Get installation details to verify it exists
    const { data: installation } = await octokit.request('GET /app/installations/{installation_id}', {
      installation_id: installation_id
    });

    const createdSources = [];
    const errors = [];

    // Create sources for selected repositories
    for (const repo of repositories) {
      try {
        // Check if source already exists for this repository
        const existingSources = await sourcesRepo.findAll({
          filters: [
            { field: 'organization_id', operator: '=', value: authContext.organization_id },
            { field: 'type', operator: '=', value: 'github' }
          ]
        });

        const existingSource = existingSources.find(s => 
          s.config.repository === repo.full_name &&
          s.config.installation_id === installation_id
        );

        if (existingSource) {
          // Update existing source if it was inactive
          if (!existingSource.is_active) {
            const updatedSource = await sourcesRepo.update(existingSource.id, {
              is_active: true
            });
            createdSources.push(updatedSource);
          } else {
            // Skip if already active
            continue;
          }
        } else {
          // Create new source
          const sourceData = {
            organization_id: authContext.organization_id,
            created_by: authContext.user_id,
            name: repo.full_name,
            description: repo.description || `GitHub repository: ${repo.full_name}`,
            type: 'github' as const,
            config: {
              installation_id: installation_id,
              repository: repo.full_name,
              repository_id: repo.id,
              default_branch: repo.default_branch,
              private: repo.private,
              auto_sync: true
            }
          };

          const source = await sourcesRepo.create(sourceData);
          createdSources.push(source);

          // Trigger initial sync asynchronously
          import('@/src/webhook/handlers').then(({ triggerInitialSync }) => {
            triggerInitialSync(source).catch(error => {
              console.error('Failed to trigger initial sync for', repo.full_name, ':', error);
            });
          });
        }
      } catch (error: any) {
        console.error(`Failed to create source for ${repo.full_name}:`, error);
        errors.push({
          repository: repo.full_name,
          error: error.message
        });
      }
    }

    return createSuccessResponse({
      installation: {
        id: installation.id,
        account: installation.account
      },
      created_sources: createdSources,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully processed ${createdSources.length} repositories${errors.length > 0 ? ` with ${errors.length} errors` : ''}`
    }, 201);

  } catch (error: any) {
    console.error('GitHub installation processing error:', error);
    return createErrorResponse('Failed to process GitHub installation', 500, error.message);
  }
});
