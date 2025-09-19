import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withMemberAuth, createErrorResponse, createSuccessResponse } from '@/src/auth/middleware';
import { projectsRepo } from '@/src/auth/repositories';
import { CreateProjectInput } from '@/src/auth/types';
import { z } from 'zod';

const CreateProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  description: z.string().optional(),
  source_id: z.number().optional(),
  settings: z.record(z.any()).optional(),
});

const SearchProjectsSchema = z.object({
  q: z.string().optional(),
  page: z.number().min(1).optional(),
  limit: z.number().min(1).max(100).optional(),
});

// GET /api/projects - Get organization projects
export const GET = withAuth(async (request) => {
  try {
    const { authContext } = request;
    const url = new URL(request.url);
    
    // Parse query parameters
    const queryParams = {
      q: url.searchParams.get('q'),
      page: url.searchParams.get('page') ? parseInt(url.searchParams.get('page')!) : undefined,
      limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : undefined,
    };

    // Validate query parameters
    const validation = SearchProjectsSchema.safeParse(queryParams);
    if (!validation.success) {
      return createErrorResponse('Invalid query parameters', 400, validation.error.issues);
    }

    const { q, page = 1, limit = 20 } = validation.data;

    let projects;
    if (q) {
      // Search projects by name
      projects = await projectsRepo.searchByName(q, authContext.organization_id, {
        pagination: { page, limit },
        sort: [{ field: 'created_at', direction: 'DESC' }]
      });
    } else {
      // Get all projects for organization
      projects = await projectsRepo.findByOrganization(authContext.organization_id, {
        pagination: { page, limit },
        sort: [{ field: 'created_at', direction: 'DESC' }]
      });
    }

    // Get project stats
    const stats = await projectsRepo.getProjectStats(authContext.organization_id);

    return createSuccessResponse({
      projects,
      stats,
      pagination: {
        page,
        limit,
        total: stats.total
      }
    });
  } catch (error: any) {
    console.error('Get projects error:', error);
    return createErrorResponse('Failed to get projects', 500, error.message);
  }
});

// POST /api/projects - Create new project (member+ only)
export const POST = withMemberAuth(async (request) => {
  try {
    const { authContext } = request;
    const body = await request.json();
    
    // Validate input
    const validation = CreateProjectSchema.safeParse(body);
    if (!validation.success) {
      return createErrorResponse('Invalid input', 400, validation.error.issues);
    }

    const { name, description, source_id, settings } = validation.data;

    // Check if project name already exists in organization
    const existingProject = await projectsRepo.findByName(name, authContext.organization_id);
    if (existingProject) {
      return createErrorResponse('Project name already exists', 400);
    }

    const createData: CreateProjectInput = {
      organization_id: authContext.organization_id,
      created_by: authContext.user_id,
      name,
      description,
      source_id,
      settings: settings || {
        ignoredFiles: ['node_modules', '.git', 'dist', 'build'],
        includedBranches: ['main', 'master', 'develop'],
        maxFileSize: 1024 * 1024, // 1MB
        autoIndex: true
      }
    };

    const project = await projectsRepo.create(createData);

    return createSuccessResponse(project, 201);
  } catch (error: any) {
    console.error('Create project error:', error);
    return createErrorResponse('Failed to create project', 500, error.message);
  }
});
