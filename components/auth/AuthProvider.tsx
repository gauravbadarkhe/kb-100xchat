'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/src/auth/supabase';
import { AuthContext, UserRow, OrganizationRow } from '@/src/auth/types';

interface AuthState {
  user: UserRow | null;
  organization: OrganizationRow | null;
  authContext: AuthContext | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
  signOut: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthProviderContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthProviderContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    organization: null,
    authContext: null,
    isLoading: true,
    isAuthenticated: false
  });

  const refreshAuth = async () => {
    try {
      setAuthState(prev => ({ ...prev, isLoading: true }));

      const response = await fetch('/api/auth/session', {
        method: 'GET',
        credentials: 'include',
      });

      if (response.ok) {
        const sessionData = await response.json();
        
        if (sessionData.authenticated) {
          setAuthState({
            user: sessionData.user,
            organization: sessionData.organization,
            authContext: sessionData.authContext,
            isLoading: false,
            isAuthenticated: true
          });
        } else {
          setAuthState({
            user: null,
            organization: null,
            authContext: null,
            isLoading: false,
            isAuthenticated: false
          });
        }
      } else {
        setAuthState({
          user: null,
          organization: null,
          authContext: null,
          isLoading: false,
          isAuthenticated: false
        });
      }
    } catch (error) {
      console.error('Error refreshing auth:', error);
      setAuthState({
        user: null,
        organization: null,
        authContext: null,
        isLoading: false,
        isAuthenticated: false
      });
    }
  };

  const signOut = async () => {
    try {
      await fetch('/api/auth/signout', {
        method: 'POST',
        credentials: 'include',
      });
      
      setAuthState({
        user: null,
        organization: null,
        authContext: null,
        isLoading: false,
        isAuthenticated: false
      });
    } catch (error) {
      console.error('Error signing out:', error);
      // Still clear the state even if sign out fails
      setAuthState({
        user: null,
        organization: null,
        authContext: null,
        isLoading: false,
        isAuthenticated: false
      });
    }
  };

  useEffect(() => {
    // Check initial auth state
    refreshAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        await refreshAuth();
      } else if (event === 'SIGNED_OUT') {
        setAuthState({
          user: null,
          organization: null,
          authContext: null,
          isLoading: false,
          isAuthenticated: false
        });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const contextValue: AuthContextType = {
    ...authState,
    signOut,
    refreshAuth
  };

  return (
    <AuthProviderContext.Provider value={contextValue}>
      {children}
    </AuthProviderContext.Provider>
  );
}

// Hook for checking if user is authenticated (for protected routes)
export function useRequireAuth() {
  const auth = useAuth();
  
  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      // Redirect to login or show auth form
      // This can be customized based on your app's routing
      window.location.href = '/auth';
    }
  }, [auth.isLoading, auth.isAuthenticated]);

  return auth;
}

// Component to protect routes
interface ProtectedRouteProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  requireRole?: 'admin' | 'member' | 'viewer';
}

export function ProtectedRoute({ children, fallback, requireRole }: ProtectedRouteProps) {
  const auth = useAuth();

  if (auth.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return fallback || (
      <div className="flex items-center justify-center min-h-screen">
        <p>Please sign in to continue</p>
      </div>
    );
  }

  // Check role requirements
  if (requireRole && auth.authContext) {
    const roleHierarchy: Record<string, number> = {
      viewer: 1,
      member: 2,
      admin: 3
    };

    if (roleHierarchy[auth.authContext.role] < roleHierarchy[requireRole]) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <p>Insufficient permissions</p>
        </div>
      );
    }
  }

  return <>{children}</>;
}
