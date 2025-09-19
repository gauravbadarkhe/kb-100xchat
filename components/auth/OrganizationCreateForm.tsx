'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
// Removed direct import of AuthService to avoid client-server conflicts

interface OrganizationCreateFormProps {
  authId: string;
  userEmail: string;
  userFullName?: string;
  onSuccess?: (user: any, organization: any) => void;
  onError?: (error: string) => void;
}

export function OrganizationCreateForm({ 
  authId, 
  userEmail, 
  userFullName, 
  onSuccess, 
  onError 
}: OrganizationCreateFormProps) {
  const [formData, setFormData] = useState({
    organizationName: '',
    organizationDescription: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/organizations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authId}`, // Pass auth ID in header
        },
        body: JSON.stringify({
          organizationName: formData.organizationName,
          organizationDescription: formData.organizationDescription || undefined,
          userEmail,
          userFullName
        }),
        credentials: 'include',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create organization');
      }

      // Add a small delay to ensure proper state update before redirect
      setTimeout(() => {
        onSuccess?.(result.user, result.organization);
      }, 100);
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to create organization';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
    if (error) setError(null); // Clear error when user starts typing
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl text-center">Create Organization</CardTitle>
        <CardDescription className="text-center">
          Set up your organization to get started with your knowledge base
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-sm text-blue-700">
            <strong>Welcome, {userFullName || userEmail}!</strong>
            <br />
            As the first user, you'll be the organization administrator.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="organizationName" className="text-sm font-medium">
              Organization Name *
            </label>
            <Input
              id="organizationName"
              type="text"
              placeholder="Enter your organization name"
              value={formData.organizationName}
              onChange={handleInputChange('organizationName')}
              required
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              This will be the name of your knowledge base workspace
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="organizationDescription" className="text-sm font-medium">
              Description
            </label>
            <Input
              id="organizationDescription"
              type="text"
              placeholder="Brief description of your organization (optional)"
              value={formData.organizationDescription}
              onChange={handleInputChange('organizationDescription')}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Help your team understand what this workspace is for
            </p>
          </div>

          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || !formData.organizationName.trim()}
          >
            {isLoading ? 'Creating organization...' : 'Create Organization'}
          </Button>
        </form>

        <div className="mt-6 p-3 bg-gray-50 border border-gray-200 rounded-md">
          <h4 className="text-sm font-medium mb-2">What's next?</h4>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• Connect your repositories and data sources</li>
            <li>• Invite team members to collaborate</li>
            <li>• Start building your knowledge base</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
