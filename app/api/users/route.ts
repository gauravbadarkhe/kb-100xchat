import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withAdminAuth, createErrorResponse, createSuccessResponse } from '@/src/auth/middleware';
import { AuthService } from '@/src/auth/service';
import { usersRepo } from '@/src/auth/repositories';
import { UserRole } from '@/src/auth/types';
import { z } from 'zod';

const InviteUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['admin', 'member', 'viewer'] as const),
});

const UpdateUserRoleSchema = z.object({
  userId: z.number(),
  role: z.enum(['admin', 'member', 'viewer'] as const),
});

// GET /api/users - Get organization members
export const GET = withAuth(async (request) => {
  try {
    const { authContext } = request;
    
    const users = await AuthService.getOrganizationMembers(authContext.organization_id);

    return createSuccessResponse(users);
  } catch (error: any) {
    console.error('Get users error:', error);
    return createErrorResponse('Failed to get users', 500, error.message);
  }
});

// POST /api/users/invite - Invite user to organization (admin only)
export const POST = withAdminAuth(async (request) => {
  try {
    const { authContext } = request;
    const body = await request.json();
    
    // Validate input
    const validation = InviteUserSchema.safeParse(body);
    if (!validation.success) {
      return createErrorResponse('Invalid input', 400, validation.error.issues);
    }

    const { email, role } = validation.data;

    const result = await AuthService.inviteUser({
      email,
      role,
      organizationId: authContext.organization_id,
      invitedBy: authContext.user_id
    });

    if (result.success) {
      return createSuccessResponse({ message: 'User invited successfully' });
    } else {
      return createErrorResponse(result.error || 'Failed to invite user', 400);
    }
  } catch (error: any) {
    console.error('Invite user error:', error);
    return createErrorResponse('Failed to invite user', 500, error.message);
  }
});
