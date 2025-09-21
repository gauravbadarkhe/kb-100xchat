import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth, createErrorResponse, createSuccessResponse } from '@/src/auth/middleware';
import { AuthService } from '@/src/auth/service';
import { UserRole } from '@/src/auth/types';
import { z } from 'zod';

const UpdateUserRoleSchema = z.object({
  role: z.enum(['admin', 'member', 'viewer'] as const),
});

// PUT /api/users/[userId] - Update user role (admin only)
export const PUT = withAdminAuth(async (request, { params }: { params: Promise<{ userId: string }> }) => {
  try {
    const { authContext } = request;
    const { userId: userIdStr } = await params;
    const userId = parseInt(userIdStr);
    
    if (isNaN(userId)) {
      return createErrorResponse('Invalid user ID', 400);
    }

    const body = await request.json();
    
    // Validate input
    const validation = UpdateUserRoleSchema.safeParse(body);
    if (!validation.success) {
      return createErrorResponse('Invalid input', 400, JSON.stringify(validation.error.issues));
    }

    const { role } = validation.data;

    const result = await AuthService.updateUserRole(userId, role, authContext);

    if (result.success) {
      return createSuccessResponse({ message: 'User role updated successfully' });
    } else {
      return createErrorResponse(result.error || 'Failed to update user role', 400);
    }
  } catch (error: any) {
    console.error('Update user role error:', error);
    return createErrorResponse('Failed to update user role', 500, error.message);
  }
});

// DELETE /api/users/[userId] - Remove user from organization (admin only)
export const DELETE = withAdminAuth(async (request, { params }: { params: Promise<{ userId: string }> }) => {
  try {
    const { authContext } = request;
    const { userId: userIdStr } = await params;
    const userId = parseInt(userIdStr);
    
    if (isNaN(userId)) {
      return createErrorResponse('Invalid user ID', 400);
    }

    const result = await AuthService.removeUser(userId, authContext);

    if (result.success) {
      return createSuccessResponse({ message: 'User removed successfully' });
    } else {
      return createErrorResponse(result.error || 'Failed to remove user', 400);
    }
  } catch (error: any) {
    console.error('Remove user error:', error);
    return createErrorResponse('Failed to remove user', 500, error.message);
  }
});
