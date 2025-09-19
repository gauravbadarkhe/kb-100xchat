// src/auth/service.ts
// Authentication service layer

import { supabase, supabaseAdmin } from './supabase';
import { organizationsRepo, usersRepo } from './repositories';
import { AuthContext, UserRow, OrganizationRow, CreateOrganizationInput, UserRole } from './types';
import { DatabaseError, ValidationError, NotFoundError } from '../db/crud';

export type SignUpInput = {
  email: string;
  password: string;
  fullName?: string;
  organizationName?: string;
  organizationDescription?: string;
};

export type SignInInput = {
  email: string;
  password: string;
};

export type AuthResponse = {
  success: boolean;
  user?: UserRow;
  organization?: OrganizationRow;
  needsOrganization?: boolean;
  error?: string;
};

export class AuthService {
  /**
   * Sign up a new user
   */
  static async signUp(input: SignUpInput): Promise<AuthResponse> {
    try {
      // Create auth user in Supabase
      const { data, error } = await supabase.auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          data: {
            full_name: input.fullName
          }
        }
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (!data.user) {
        return { success: false, error: 'Failed to create user' };
      }

      // Check if user needs to create an organization
      if (!input.organizationName) {
        return { 
          success: true, 
          needsOrganization: true,
          user: {
            id: 0, // Temporary, will be set after organization creation
            auth_id: data.user.id,
            organization_id: 0,
            email: input.email,
            full_name: input.fullName || null,
            role: 'admin',
            settings: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_login_at: null,
            deleted_at: null
          }
        };
      }

      // Create organization and user
      const result = await this.createUserWithOrganization({
        authId: data.user.id,
        email: input.email,
        fullName: input.fullName,
        organizationName: input.organizationName,
        organizationDescription: input.organizationDescription
      });

      return { success: true, user: result.user, organization: result.organization };
    } catch (error: any) {
      console.error('Sign up error:', error);
      return { success: false, error: error.message || 'Sign up failed' };
    }
  }

  /**
   * Sign in an existing user
   */
  static async signIn(input: SignInInput): Promise<AuthResponse> {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: input.email,
        password: input.password
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (!data.user) {
        return { success: false, error: 'Failed to sign in' };
      }

      // Get user from our database
      const user = await usersRepo.findByAuthId(data.user.id);
      if (!user) {
        return { 
          success: true, 
          needsOrganization: true,
          user: {
            id: 0,
            auth_id: data.user.id,
            organization_id: 0,
            email: input.email,
            full_name: data.user.user_metadata?.full_name || null,
            role: 'admin',
            settings: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_login_at: null,
            deleted_at: null
          }
        };
      }

      // Update last login
      await usersRepo.updateLastLogin(user.id);

      // Get organization
      const organization = await organizationsRepo.findById(user.organization_id);

      return { 
        success: true, 
        user, 
        organization: organization || undefined 
      };
    } catch (error: any) {
      console.error('Sign in error:', error);
      return { success: false, error: error.message || 'Sign in failed' };
    }
  }

  /**
   * Sign out user
   */
  static async signOut(): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Sign out failed' };
    }
  }

  /**
   * Create organization for existing auth user
   */
  static async createOrganization(input: {
    authId: string;
    organizationName: string;
    organizationDescription?: string;
    userEmail: string;
    userFullName?: string;
  }): Promise<{ user: UserRow; organization: OrganizationRow }> {
    return this.createUserWithOrganization({
      authId: input.authId,
      email: input.userEmail,
      fullName: input.userFullName,
      organizationName: input.organizationName,
      organizationDescription: input.organizationDescription
    });
  }

  /**
   * Create user with organization (internal helper)
   */
  private static async createUserWithOrganization(input: {
    authId: string;
    email: string;
    fullName?: string;
    organizationName: string;
    organizationDescription?: string;
  }): Promise<{ user: UserRow; organization: OrganizationRow }> {
    try {
      // Check if organization name is already taken
      const existingOrg = await organizationsRepo.findByName(input.organizationName);
      if (existingOrg) {
        throw new ValidationError('Organization name already taken');
      }

      // Create organization
      const organization = await organizationsRepo.create({
        name: input.organizationName,
        description: input.organizationDescription,
        settings: {}
      });

      // Create user
      const user = await usersRepo.create({
        auth_id: input.authId,
        organization_id: organization.id,
        email: input.email,
        full_name: input.fullName,
        role: 'admin', // First user is always admin
        settings: {}
      });

      return { user, organization };
    } catch (error) {
      if (error instanceof ValidationError || error instanceof DatabaseError) {
        throw error;
      }
      throw new DatabaseError('Failed to create user with organization');
    }
  }

  /**
   * Get current auth context from session
   */
  static async getCurrentAuthContext(): Promise<AuthContext | null> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return null;

      const user = await usersRepo.findByAuthId(session.user.id);
      if (!user) return null;

      return {
        user_id: user.id,
        auth_id: user.auth_id,
        organization_id: user.organization_id,
        role: user.role,
        email: user.email
      };
    } catch (error) {
      console.error('Error getting auth context:', error);
      return null;
    }
  }

  /**
   * Invite user to organization
   */
  static async inviteUser(input: {
    email: string;
    role: UserRole;
    organizationId: number;
    invitedBy: number;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if user already exists in the organization
      const existingUser = await usersRepo.findByEmail(input.email, input.organizationId);
      if (existingUser) {
        return { success: false, error: 'User already exists in this organization' };
      }

      // For now, create the user with a temporary password
      // In production, you'd send an invitation email
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: input.email,
        password: 'temp-password-123', // Should be generated and sent via email
        email_confirm: true
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (!data.user) {
        return { success: false, error: 'Failed to create user' };
      }

      // Create user in our database
      await usersRepo.create({
        auth_id: data.user.id,
        organization_id: input.organizationId,
        email: input.email,
        role: input.role,
        settings: {}
      });

      return { success: true };
    } catch (error: any) {
      console.error('Invite user error:', error);
      return { success: false, error: error.message || 'Failed to invite user' };
    }
  }

  /**
   * Update user role
   */
  static async updateUserRole(userId: number, newRole: UserRole, currentUserContext: AuthContext): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if current user has permission (admin only)
      if (currentUserContext.role !== 'admin') {
        return { success: false, error: 'Insufficient permissions' };
      }

      const user = await usersRepo.findById(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Check if user is in the same organization
      if (user.organization_id !== currentUserContext.organization_id) {
        return { success: false, error: 'User not in your organization' };
      }

      // Don't allow changing own role
      if (user.id === currentUserContext.user_id) {
        return { success: false, error: 'Cannot change your own role' };
      }

      await usersRepo.update(userId, { role: newRole });
      return { success: true };
    } catch (error: any) {
      console.error('Update user role error:', error);
      return { success: false, error: error.message || 'Failed to update user role' };
    }
  }

  /**
   * Remove user from organization
   */
  static async removeUser(userId: number, currentUserContext: AuthContext): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if current user has permission (admin only)
      if (currentUserContext.role !== 'admin') {
        return { success: false, error: 'Insufficient permissions' };
      }

      const user = await usersRepo.findById(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Check if user is in the same organization
      if (user.organization_id !== currentUserContext.organization_id) {
        return { success: false, error: 'User not in your organization' };
      }

      // Don't allow removing self
      if (user.id === currentUserContext.user_id) {
        return { success: false, error: 'Cannot remove yourself' };
      }

      // Soft delete user
      await usersRepo.softDelete(userId);

      // Optionally, delete from Supabase auth as well
      await supabaseAdmin.auth.admin.deleteUser(user.auth_id);

      return { success: true };
    } catch (error: any) {
      console.error('Remove user error:', error);
      return { success: false, error: error.message || 'Failed to remove user' };
    }
  }

  /**
   * Get organization members
   */
  static async getOrganizationMembers(organizationId: number): Promise<UserRow[]> {
    return usersRepo.getOrganizationMembers(organizationId);
  }

  /**
   * Reset password
   */
  static async resetPassword(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Password reset failed' };
    }
  }
}
