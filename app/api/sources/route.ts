import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withMemberAuth, createErrorResponse, createSuccessResponse } from '@/src/auth/middleware';
import { sourcesRepo } from '@/src/auth/repositories';
import { CreateSourceInput, SourceType } from '@/src/auth/types';
import { z } from 'zod';

const CreateSourceSchema = z.object({
  name: z.string().min(1, 'Source name is required'),
  description: z.string().optional(),
  type: z.enum(['github', 'bitbucket', 'gitlab', 'documentation', 'confluence', 'notion', 'file_upload', 'other'] as const),
  config: z.record(z.string(), z.any()),
});

const SearchSourcesSchema = z.object({
  type: z.enum(['github', 'bitbucket', 'gitlab', 'documentation', 'confluence', 'notion', 'file_upload', 'other'] as const).optional(),
  page: z.number().min(1).optional(),
  limit: z.number().min(1).max(100).optional(),
});

// GET /api/sources - Get organization sources
export const GET = withAuth(async (request) => {
  try {
    const { authContext } = request;
    const url = new URL(request.url);
    
    // Parse query parameters
    const queryParams = {
      type: url.searchParams.get('type'),
      page: url.searchParams.get('page') ? parseInt(url.searchParams.get('page')!) : undefined,
      limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : undefined,
    };

    // Validate query parameters
    const validation = SearchSourcesSchema.safeParse(queryParams);
    if (!validation.success) {
      return createErrorResponse('Invalid query parameters', 400, JSON.stringify(validation.error.issues));
    }

    const { type, page = 1, limit = 20 } = validation.data;

    let sources;
    if (type) {
      // Filter sources by type
      sources = await sourcesRepo.findByType(type, authContext.organization_id, {
        pagination: { page, limit },
        sort: [{ field: 'created_at', direction: 'DESC' }]
      });
    } else {
      // Get all sources for organization
      sources = await sourcesRepo.findByOrganization(authContext.organization_id, {
        pagination: { page, limit },
        sort: [{ field: 'created_at', direction: 'DESC' }]
      });
    }

    // Get total count for pagination
    const totalCount = await sourcesRepo.count([
      { field: 'organization_id', operator: '=', value: authContext.organization_id },
      ...(type ? [{ field: 'type', operator: '=' as const, value: type }] : [])
    ]);

    return createSuccessResponse({
      sources,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error: any) {
    console.error('Get sources error:', error);
    return createErrorResponse('Failed to get sources', 500, error.message);
  }
});

// POST /api/sources - Create new source (member+ only)
export const POST = withMemberAuth(async (request) => {
  try {
    const { authContext } = request;
    const body = await request.json();
    
    // Validate input
    const validation = CreateSourceSchema.safeParse(body);
    if (!validation.success) {
      return createErrorResponse('Invalid input', 400, JSON.stringify(validation.error.issues));
    }

    const { name, description, type, config } = validation.data;

    // Validate source-specific configuration
    const configValidation = validateSourceConfig(type, config);
    if (!configValidation.valid) {
      return createErrorResponse('Invalid configuration', 400, Array.isArray(configValidation.errors) ? configValidation.errors.join(', ') : configValidation.errors);
    }

    const createData: CreateSourceInput = {
      organization_id: authContext.organization_id,
      created_by: authContext.user_id,
      name,
      description,
      type,
      config
    };

    const source = await sourcesRepo.create(createData);

    // Trigger initial sync for GitHub sources
    if (type === 'github' && config.installation_id) {
      // Import and trigger sync asynchronously (don't wait for completion)
      import('@/src/webhook/handlers').then(({ triggerInitialSync }) => {
        triggerInitialSync(source).catch(error => {
          console.error('Failed to trigger initial sync:', error);
        });
      });
    }

    return createSuccessResponse(source, 201);
  } catch (error: any) {
    console.error('Create source error:', error);
    return createErrorResponse('Failed to create source', 500, error.message);
  }
});

// Helper function to validate source-specific configuration
function validateSourceConfig(type: SourceType, config: Record<string, any>): { valid: boolean; errors?: string[] } {
  const errors: string[] = [];

  switch (type) {
    case 'github':
      if (!config.installation_id && !config.token) {
        errors.push('GitHub installation ID or token is required');
      }
      if (!config.repository) errors.push('Repository is required');
      if (config.repository && !config.repository.includes('/')) {
        errors.push('Repository must be in format owner/repository-name');
      }
      if (config.installation_id && typeof config.installation_id !== 'number') {
        errors.push('Installation ID must be a number');
      }
      break;

    case 'bitbucket':
      if (!config.username) errors.push('Username is required');
      if (!config.app_password) errors.push('App password is required');
      if (!config.repository) errors.push('Repository is required');
      break;

    case 'gitlab':
      if (!config.token) errors.push('GitLab token is required');
      if (!config.project_id) errors.push('Project ID is required');
      break;

    case 'documentation':
      if (!config.url) errors.push('Documentation URL is required');
      if (config.url && !isValidUrl(config.url)) {
        errors.push('Invalid URL format');
      }
      if (config.crawl_depth && (config.crawl_depth < 1 || config.crawl_depth > 10)) {
        errors.push('Crawl depth must be between 1 and 10');
      }
      break;

    case 'confluence':
      if (!config.base_url) errors.push('Confluence base URL is required');
      if (!config.username) errors.push('Username is required');
      if (!config.api_token) errors.push('API token is required');
      break;

    case 'notion':
      if (!config.integration_token) errors.push('Integration token is required');
      break;

    case 'file_upload':
      if (config.max_file_size && config.max_file_size > 100 * 1024 * 1024) {
        errors.push('Max file size cannot exceed 100MB');
      }
      break;

    case 'other':
      // For other types, we just check if some basic config is provided
      if (!config.url && !config.api_key && !config.endpoint) {
        errors.push('At least one configuration parameter is required');
      }
      break;
  }

  return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
}

function isValidUrl(string: string): boolean {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}
