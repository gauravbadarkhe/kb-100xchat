import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withMemberAuth, withOrganizationAccess, createErrorResponse, createSuccessResponse, AuthenticatedRequest } from '@/src/auth/middleware';
import { projectsRepo } from '@/src/auth/repositories';
import { UpdateProjectInput } from '@/src/auth/types';
import { z } from 'zod';

const UpdateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  source_id: z.number().optional(),
  settings: z.record(z.string(), z.any()).optional(),
  is_active: z.boolean().optional(),
});

// Helper to validate project access
async function validateProjectAccess(projectId: number, organizationId: number) {
  const project = await projectsRepo.findById(projectId);
  if (!project) {
    throw new Error('Project not found');
  }
  if (project.organization_id !== organizationId) {
    throw new Error('Access denied to this project');
  }
  return project;
}

// GET /api/projects/[projectId] - Get specific project
export const GET = withAuth(async (request, { params }: { params: Promise<{ projectId: string }> }) => {
  try {
    const { authContext } = request;
    const { projectId: projectIdStr } = await params;
    const projectId = parseInt(projectIdStr);
    
    if (isNaN(projectId)) {
      return createErrorResponse('Invalid project ID', 400);
    }

    const project = await validateProjectAccess(projectId, authContext.organization_id);

    return createSuccessResponse(project);
  } catch (error: any) {
    console.error('Get project error:', error);
    
    if (error.message === 'Project not found') {
      return createErrorResponse('Project not found', 404);
    }
    if (error.message === 'Access denied to this project') {
      return createErrorResponse('Access denied to this project', 403);
    }
    
    return createErrorResponse('Failed to get project', 500, error.message);
  }
});

// PUT /api/projects/[projectId] - Update project (member+ only)
export const PUT = withMemberAuth(async (request, { params }: { params: Promise<{ projectId: string }> }) => {
  try {
    const { authContext } = request;
    const { projectId: projectIdStr } = await params;
    const projectId = parseInt(projectIdStr);
    
    if (isNaN(projectId)) {
      return createErrorResponse('Invalid project ID', 400);
    }

    // Validate project access
    await validateProjectAccess(projectId, authContext.organization_id);

    const body = await request.json();
    
    // Validate input
    const validation = UpdateProjectSchema.safeParse(body);
    if (!validation.success) {
      return createErrorResponse('Invalid input', 400, JSON.stringify(validation.error.issues));
    }

    const updateData = validation.data;

    // If name is being updated, check for conflicts
    if (updateData.name) {
      const existingProject = await projectsRepo.findByName(updateData.name, authContext.organization_id);
      if (existingProject && existingProject.id !== projectId) {
        return createErrorResponse('Project name already exists', 400);
      }
    }

    const updatedProject = await projectsRepo.update(projectId, updateData);

    return createSuccessResponse(updatedProject);
  } catch (error: any) {
    console.error('Update project error:', error);
    
    if (error.message === 'Project not found') {
      return createErrorResponse('Project not found', 404);
    }
    if (error.message === 'Access denied to this project') {
      return createErrorResponse('Access denied to this project', 403);
    }
    
    return createErrorResponse('Failed to update project', 500, error.message);
  }
});

// DELETE /api/projects/[projectId] - Delete project (member+ only)
export const DELETE = withMemberAuth(async (request, { params }: { params: Promise<{ projectId: string }> }) => {
  try {
    const { authContext } = request;
    const { projectId: projectIdStr } = await params;
    const projectId = parseInt(projectIdStr);
    
    if (isNaN(projectId)) {
      return createErrorResponse('Invalid project ID', 400);
    }

    // Validate project access
    await validateProjectAccess(projectId, authContext.organization_id);

    // Soft delete the project
    await projectsRepo.softDelete(projectId);

    return createSuccessResponse({ message: 'Project deleted successfully' });
  } catch (error: any) {
    console.error('Delete project error:', error);
    
    if (error.message === 'Project not found') {
      return createErrorResponse('Project not found', 404);
    }
    if (error.message === 'Access denied to this project') {
      return createErrorResponse('Access denied to this project', 403);
    }
    
    return createErrorResponse('Failed to delete project', 500, error.message);
  }
});
