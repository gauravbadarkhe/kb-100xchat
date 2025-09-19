'use client';

import React, { useState } from 'react';
import { LoginForm } from './LoginForm';
import { SignupForm } from './SignupForm';
import { OrganizationCreateForm } from './OrganizationCreateForm';

type AuthState = 
  | { type: 'login' }
  | { type: 'signup' }
  | { type: 'create-organization'; authId: string; email: string; fullName?: string };

interface AuthFlowProps {
  onAuthSuccess?: (user: any, organization?: any) => void;
  onAuthError?: (error: string) => void;
  initialState?: AuthState['type'];
}

export function AuthFlow({ onAuthSuccess, onAuthError, initialState = 'login' }: AuthFlowProps) {
  const [authState, setAuthState] = useState<AuthState>({ type: initialState });
  const [isLoading, setIsLoading] = useState(false);

  const handleAuthSuccess = (user: any, organization?: any) => {
    setIsLoading(false);
    onAuthSuccess?.(user, organization);
  };

  const handleAuthError = (error: string) => {
    setIsLoading(false);
    onAuthError?.(error);
  };

  const handleNeedsOrganization = (authId: string, email: string, fullName?: string) => {
    setAuthState({ type: 'create-organization', authId, email, fullName });
  };

  switch (authState.type) {
    case 'login':
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full space-y-8">
            <LoginForm
              onSuccess={handleAuthSuccess}
              onNeedsOrganization={handleNeedsOrganization}
              onError={handleAuthError}
              onSwitchToSignup={() => setAuthState({ type: 'signup' })}
            />
          </div>
        </div>
      );

    case 'signup':
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full space-y-8">
            <SignupForm
              onSuccess={handleAuthSuccess}
              onNeedsOrganization={handleNeedsOrganization}
              onError={handleAuthError}
              onSwitchToLogin={() => setAuthState({ type: 'login' })}
            />
          </div>
        </div>
      );

    case 'create-organization':
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full space-y-8">
            <OrganizationCreateForm
              authId={authState.authId}
              userEmail={authState.email}
              userFullName={authState.fullName}
              onSuccess={handleAuthSuccess}
              onError={handleAuthError}
            />
          </div>
        </div>
      );

    default:
      return null;
  }
}
