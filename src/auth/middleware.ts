// src/auth/middleware.ts
// Authentication middleware for Next.js API routes

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from './supabase';
import { usersRepo } from './repositories';
import { AuthContext } from './types';

export type AuthenticatedRequest = NextRequest & {
  authContext: AuthContext;
};

/**
 * Middleware to authenticate API requests
 */
export async function withAuth<T extends any[]>(
  handler: (request: AuthenticatedRequest, ...args: T) => Promise<NextResponse>
) {
  return async (request: NextRequest, ...args: T): Promise<NextResponse> => {
    try {
      // Get authorization header
      const authHeader = request.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json(
          { error: 'Authorization header required' },
          { status: 401 }
        );
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix

      // Verify token with Supabase
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        return NextResponse.json(
          { error: 'Invalid or expired token' },
          { status: 401 }
        );
      }

      // Get user from our database
      const dbUser = await usersRepo.findByAuthId(user.id);
      if (!dbUser) {
        return NextResponse.json(
          { error: 'User not found in organization' },
          { status: 401 }
        );
      }

      // Add auth context to request
      const authContext: AuthContext = {
        user_id: dbUser.id,
        auth_id: dbUser.auth_id,
        organization_id: dbUser.organization_id,
        role: dbUser.role,
        email: dbUser.email
      };

      (request as AuthenticatedRequest).authContext = authContext;

      return handler(request as AuthenticatedRequest, ...args);
    } catch (error: any) {
      console.error('Auth middleware error:', error);
      return NextResponse.json(
        { error: 'Authentication failed', detail: error.message },
        { status: 500 }
      );
    }
  };
}

/**
 * Middleware to check specific permissions
 */
export function withPermission(requiredRole: 'admin' | 'member' | 'viewer') {
  return function<T extends any[]>(
    handler: (request: AuthenticatedRequest, ...args: T) => Promise<NextResponse>
  ) {
    return withAuth(async (request: AuthenticatedRequest, ...args: T) => {
      const { role } = request.authContext;

      // Define role hierarchy
      const roleHierarchy: Record<string, number> = {
        viewer: 1,
        member: 2,
        admin: 3
      };

      if (roleHierarchy[role] < roleHierarchy[requiredRole]) {
        return NextResponse.json(
          { error: 'Insufficient permissions' },
          { status: 403 }
        );
      }

      return handler(request, ...args);
    });
  };
}

/**
 * Middleware for admin-only routes
 */
export const withAdminAuth = withPermission('admin');

/**
 * Middleware for member and above routes
 */
export const withMemberAuth = withPermission('member');

/**
 * Extract auth context from cookies (for SSR)
 */
export async function getAuthContextFromCookies(request: NextRequest): Promise<AuthContext | null> {
  try {
    // Get Supabase session from cookies
    const accessToken = request.cookies.get('sb-access-token')?.value;
    const refreshToken = request.cookies.get('sb-refresh-token')?.value;

    if (!accessToken) {
      return null;
    }

    // Verify token
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      return null;
    }

    // Get user from database
    const dbUser = await usersRepo.findByAuthId(user.id);
    if (!dbUser) {
      return null;
    }

    return {
      user_id: dbUser.id,
      auth_id: dbUser.auth_id,
      organization_id: dbUser.organization_id,
      role: dbUser.role,
      email: dbUser.email
    };
  } catch (error) {
    console.error('Error getting auth context from cookies:', error);
    return null;
  }
}

/**
 * Middleware to validate organization access
 */
export function withOrganizationAccess<T extends any[]>(
  getOrganizationId: (request: NextRequest, ...args: T) => number | string
) {
  return function(
    handler: (request: AuthenticatedRequest, ...args: T) => Promise<NextResponse>
  ) {
    return withAuth(async (request: AuthenticatedRequest, ...args: T) => {
      const requestedOrgId = Number(getOrganizationId(request, ...args));
      const { organization_id } = request.authContext;

      if (requestedOrgId !== organization_id) {
        return NextResponse.json(
          { error: 'Access denied to this organization' },
          { status: 403 }
        );
      }

      return handler(request, ...args);
    });
  };
}

/**
 * Error response helper
 */
export function createErrorResponse(message: string, status: number = 400, detail?: string) {
  return NextResponse.json(
    { error: message, detail },
    { status }
  );
}

/**
 * Success response helper
 */
export function createSuccessResponse(data: any, status: number = 200) {
  return NextResponse.json(data, { status });
}
