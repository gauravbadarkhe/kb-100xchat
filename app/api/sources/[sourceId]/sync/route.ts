import { NextRequest, NextResponse } from 'next/server';
import { withMemberAuth, createErrorResponse, createSuccessResponse } from '@/src/auth/middleware';
import { sourcesRepo } from '@/src/auth/repositories';
import { triggerInitialSync } from '@/src/webhook/handlers';

// POST /api/sources/[sourceId]/sync - Manually trigger sync for a source
export const POST = withMemberAuth(async (request, context) => {
  try {
    const { authContext } = request;
    const sourceId = parseInt(context.params.sourceId as string);

    if (isNaN(sourceId)) {
      return createErrorResponse('Invalid source ID', 400);
    }

    // Get source and verify access
    const source = await sourcesRepo.findById(sourceId);
    if (!source) {
      return createErrorResponse('Source not found', 404);
    }

    if (source.organization_id !== authContext.organization_id) {
      return createErrorResponse('Access denied', 403);
    }

    if (!source.is_active) {
      return createErrorResponse('Cannot sync inactive source', 400);
    }

    // Check if source type supports sync
    if (source.type !== 'github') {
      return createErrorResponse('Sync not supported for this source type', 400);
    }

    // Validate GitHub configuration
    if (!source.config.installation_id || !source.config.repository) {
      return createErrorResponse('Source not properly configured for sync', 400);
    }

    // Check if already syncing
    if (source.sync_status === 'syncing') {
      return createErrorResponse('Sync already in progress', 409);
    }

    // Trigger sync asynchronously
    triggerInitialSync(source).catch(error => {
      console.error('Manual sync failed:', error);
    });

    return createSuccessResponse({
      message: 'Sync triggered successfully',
      source_id: sourceId,
      status: 'syncing'
    });

  } catch (error: any) {
    console.error('Manual sync trigger error:', error);
    return createErrorResponse('Failed to trigger sync', 500, error.message);
  }
});

// GET /api/sources/[sourceId]/sync - Get sync status
export const GET = withMemberAuth(async (request, context) => {
  try {
    const { authContext } = request;
    const sourceId = parseInt(context.params.sourceId as string);

    if (isNaN(sourceId)) {
      return createErrorResponse('Invalid source ID', 400);
    }

    // Get source and verify access
    const source = await sourcesRepo.findById(sourceId);
    if (!source) {
      return createErrorResponse('Source not found', 404);
    }

    if (source.organization_id !== authContext.organization_id) {
      return createErrorResponse('Access denied', 403);
    }

    return createSuccessResponse({
      source_id: sourceId,
      sync_status: source.sync_status,
      last_synced_at: source.last_synced_at,
      sync_error: source.sync_error,
      is_active: source.is_active
    });

  } catch (error: any) {
    console.error('Get sync status error:', error);
    return createErrorResponse('Failed to get sync status', 500, error.message);
  }
});
