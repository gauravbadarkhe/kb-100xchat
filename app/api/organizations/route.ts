import { NextRequest, NextResponse } from 'next/server';
import { withAuth, createErrorResponse, createSuccessResponse } from '@/src/auth/middleware';
import { AuthService } from '@/src/auth/service';
import { organizationsRepo } from '@/src/auth/repositories';
import { z } from 'zod';

const CreateOrganizationSchema = z.object({
  organizationName: z.string().min(1, 'Organization name is required'),
  organizationDescription: z.string().optional(),
  userEmail: z.string().email('Valid email is required'),
  userFullName: z.string().optional()
});

const UpdateOrganizationSchema = z.object({
  name: z.string().min(1, 'Organization name is required'),
  description: z.string().optional()
});

// GET /api/organizations - Get current user's organization
export const GET = withAuth(async (request) => {
  try {
    const { authContext } = request;
    
    const organization = await organizationsRepo.findById(authContext.organization_id);
    if (!organization) {
      return createErrorResponse('Organization not found', 404);
    }

    return createSuccessResponse(organization);
  } catch (error: any) {
    console.error('Get organization error:', error);
    return createErrorResponse('Failed to get organization', 500, error.message);
  }
});

// POST /api/organizations - Create organization for existing auth user
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate input
    const validation = CreateOrganizationSchema.safeParse(body);
    if (!validation.success) {
      return createErrorResponse('Invalid input', 400, JSON.stringify(validation.error.issues));
    }

    const { organizationName, organizationDescription, userEmail, userFullName } = validation.data;

    // Get auth ID from authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return createErrorResponse('Authorization header required', 401);
    }

    const token = authHeader.substring(7);
    
    // Verify token with Supabase to get auth ID
    const { supabase } = await import('@/src/auth/supabase');
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return createErrorResponse('Invalid or expired token', 401);
    }

    const result = await AuthService.createOrganization({
      authId: user.id,
      organizationName,
      organizationDescription,
      userEmail,
      userFullName
    });

    return createSuccessResponse(result);
  } catch (error: any) {
    console.error('Create organization error:', error);
    return createErrorResponse('Failed to create organization', 500, error.message);
  }
}

// PUT /api/organizations - Update current user's organization
export const PUT = withAuth(async (request) => {
  try {
    const { authContext } = request;
    
    // Check if user is admin
    if (authContext.role !== 'admin') {
      return createErrorResponse('Insufficient permissions', 403);
    }

    const body = await request.json();
    
    // Validate input
    const validation = UpdateOrganizationSchema.safeParse(body);
    if (!validation.success) {
      return createErrorResponse('Invalid input', 400, JSON.stringify(validation.error.issues));
    }

    const updateData = validation.data;

    const updatedOrganization = await organizationsRepo.update(authContext.organization_id, updateData);

    return createSuccessResponse(updatedOrganization);
  } catch (error: any) {
    console.error('Update organization error:', error);
    return createErrorResponse('Failed to update organization', 500, error.message);
  }
});
