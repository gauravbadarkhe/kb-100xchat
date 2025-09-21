import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withMemberAuth, createErrorResponse, createSuccessResponse } from '@/src/auth/middleware';
import { sourcesRepo } from '@/src/auth/repositories';
import { UpdateSourceInput } from '@/src/auth/types';
import { z } from 'zod';

const UpdateSourceSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  config: z.record(z.string(), z.any()).optional(),
  is_active: z.boolean().optional(),
});

// Helper to validate source access
async function validateSourceAccess(sourceId: number, organizationId: number) {
  const source = await sourcesRepo.findById(sourceId);
  if (!source) {
    throw new Error('Source not found');
  }
  if (source.organization_id !== organizationId) {
    throw new Error('Access denied to this source');
  }
  return source;
}

// GET /api/sources/[sourceId] - Get specific source
export const GET = withAuth(async (request, { params }: { params: Promise<{ sourceId: string }> }) => {
  try {
    const { authContext } = request;
    const { sourceId: sourceIdStr } = await params;
    const sourceId = parseInt(sourceIdStr);
    
    if (isNaN(sourceId)) {
      return createErrorResponse('Invalid source ID', 400);
    }

    const source = await validateSourceAccess(sourceId, authContext.organization_id);

    return createSuccessResponse(source);
  } catch (error: any) {
    console.error('Get source error:', error);
    
    if (error.message === 'Source not found') {
      return createErrorResponse('Source not found', 404);
    }
    if (error.message === 'Access denied to this source') {
      return createErrorResponse('Access denied to this source', 403);
    }
    
    return createErrorResponse('Failed to get source', 500, error.message);
  }
});

// PUT /api/sources/[sourceId] - Update source (member+ only)
export const PUT = withMemberAuth(async (request, { params }: { params: Promise<{ sourceId: string }> }) => {
  try {
    const { authContext } = request;
    const { sourceId: sourceIdStr } = await params;
    const sourceId = parseInt(sourceIdStr);
    
    if (isNaN(sourceId)) {
      return createErrorResponse('Invalid source ID', 400);
    }

    // Validate source access
    const existingSource = await validateSourceAccess(sourceId, authContext.organization_id);

    const body = await request.json();
    
    // Validate input
    const validation = UpdateSourceSchema.safeParse(body);
    if (!validation.success) {
      return createErrorResponse('Invalid input', 400, JSON.stringify(validation.error.issues));
    }

    const updateData = validation.data;

    // If config is being updated, merge with existing config
    if (updateData.config) {
      updateData.config = { ...existingSource.config, ...updateData.config };
    }

    const updatedSource = await sourcesRepo.update(sourceId, updateData);

    return createSuccessResponse(updatedSource);
  } catch (error: any) {
    console.error('Update source error:', error);
    
    if (error.message === 'Source not found') {
      return createErrorResponse('Source not found', 404);
    }
    if (error.message === 'Access denied to this source') {
      return createErrorResponse('Access denied to this source', 403);
    }
    
    return createErrorResponse('Failed to update source', 500, error.message);
  }
});

// DELETE /api/sources/[sourceId] - Delete source (member+ only)
export const DELETE = withMemberAuth(async (request, { params }: { params: Promise<{ sourceId: string }> }) => {
  try {
    const { authContext } = request;
    const { sourceId: sourceIdStr } = await params;
    const sourceId = parseInt(sourceIdStr);
    
    if (isNaN(sourceId)) {
      return createErrorResponse('Invalid source ID', 400);
    }

    // Validate source access
    await validateSourceAccess(sourceId, authContext.organization_id);

    // Soft delete the source
    await sourcesRepo.softDelete(sourceId);

    return createSuccessResponse({ message: 'Source deleted successfully' });
  } catch (error: any) {
    console.error('Delete source error:', error);
    
    if (error.message === 'Source not found') {
      return createErrorResponse('Source not found', 404);
    }
    if (error.message === 'Access denied to this source') {
      return createErrorResponse('Access denied to this source', 403);
    }
    
    return createErrorResponse('Failed to delete source', 500, error.message);
  }
});
