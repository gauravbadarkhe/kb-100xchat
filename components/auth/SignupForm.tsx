'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
// Removed direct import of AuthService to avoid client-server conflicts

interface SignUpInput {
  email: string;
  password: string;
  fullName?: string;
  organizationName?: string;
  organizationDescription?: string;
}

interface SignupFormProps {
  onSuccess?: (user: any, organization?: any) => void;
  onNeedsOrganization?: (authId: string, email: string, fullName?: string) => void;
  onError?: (error: string) => void;
  onSwitchToLogin?: () => void;
}

export function SignupForm({ onSuccess, onNeedsOrganization, onError, onSwitchToLogin }: SignupFormProps) {
  const [formData, setFormData] = useState<SignUpInput>({
    email: '',
    password: '',
    fullName: '',
    organizationName: '',
    organizationDescription: ''
  });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOrgFields, setShowOrgFields] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    // Validate passwords match
    if (formData.password !== confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    // Validate password strength
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long');
      setIsLoading(false);
      return;
    }

    try {
      const signUpData: SignUpInput = {
        email: formData.email,
        password: formData.password,
        fullName: formData.fullName || undefined
      };

      // Only include organization data if fields are filled
      if (showOrgFields && formData.organizationName) {
        signUpData.organizationName = formData.organizationName;
        signUpData.organizationDescription = formData.organizationDescription || undefined;
      }

      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(signUpData),
        credentials: 'include',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Sign up failed');
      }
      
      if (result.success) {
        if (result.needsOrganization && result.user) {
          onNeedsOrganization?.(result.user.auth_id, result.user.email, result.user.full_name || undefined);
        } else if (result.user) {
          // Add a small delay to ensure Supabase session is properly established
          setTimeout(() => {
            onSuccess?.(result.user, result.organization);
          }, 100);
        }
      } else {
        const errorMessage = result.error || 'Sign up failed';
        setError(errorMessage);
        onError?.(errorMessage);
      }
    } catch (err: any) {
      const errorMessage = err.message || 'An unexpected error occurred';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: keyof SignUpInput | 'confirmPassword') => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (field === 'confirmPassword') {
      setConfirmPassword(e.target.value);
    } else {
      setFormData(prev => ({ ...prev, [field]: e.target.value }));
    }
    if (error) setError(null); // Clear error when user starts typing
  };

  const isFormValid = () => {
    return (
      formData.email &&
      formData.password &&
      confirmPassword &&
      formData.password === confirmPassword &&
      formData.password.length >= 8 &&
      (!showOrgFields || formData.organizationName)
    );
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl text-center">Create Account</CardTitle>
        <CardDescription className="text-center">
          Sign up to create your knowledge base
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email *
            </label>
            <Input
              id="email"
              type="email"
              placeholder="Enter your email"
              value={formData.email}
              onChange={handleInputChange('email')}
              required
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="fullName" className="text-sm font-medium">
              Full Name
            </label>
            <Input
              id="fullName"
              type="text"
              placeholder="Enter your full name"
              value={formData.fullName}
              onChange={handleInputChange('fullName')}
              disabled={isLoading}
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              Password *
            </label>
            <Input
              id="password"
              type="password"
              placeholder="Create a password (min 8 characters)"
              value={formData.password}
              onChange={handleInputChange('password')}
              required
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="text-sm font-medium">
              Confirm Password *
            </label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Confirm your password"
              value={confirmPassword}
              onChange={handleInputChange('confirmPassword')}
              required
              disabled={isLoading}
            />
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium">Organization Details</label>
              <button
                type="button"
                onClick={() => setShowOrgFields(!showOrgFields)}
                className="text-xs text-muted-foreground hover:text-primary"
                disabled={isLoading}
              >
                {showOrgFields ? 'Skip for now' : 'Add organization'}
              </button>
            </div>

            {showOrgFields && (
              <>
                <div className="space-y-2 mb-4">
                  <label htmlFor="organizationName" className="text-sm font-medium">
                    Organization Name *
                  </label>
                  <Input
                    id="organizationName"
                    type="text"
                    placeholder="Enter organization name"
                    value={formData.organizationName}
                    onChange={handleInputChange('organizationName')}
                    required={showOrgFields}
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="organizationDescription" className="text-sm font-medium">
                    Organization Description
                  </label>
                  <Input
                    id="organizationDescription"
                    type="text"
                    placeholder="Brief description (optional)"
                    value={formData.organizationDescription}
                    onChange={handleInputChange('organizationDescription')}
                    disabled={isLoading}
                  />
                </div>
              </>
            )}
          </div>

          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || !isFormValid()}
          >
            {isLoading ? 'Creating account...' : 'Create Account'}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-muted-foreground">
            Already have an account?{' '}
            <button
              onClick={onSwitchToLogin}
              className="text-primary hover:underline font-medium"
              disabled={isLoading}
            >
              Sign in
            </button>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
