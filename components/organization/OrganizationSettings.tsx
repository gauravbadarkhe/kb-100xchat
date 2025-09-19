'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/components/auth/AuthProvider';
import { organizationsRepo } from '@/src/auth/repositories';
import { UpdateOrganizationInput } from '@/src/auth/types';

export function OrganizationSettings() {
  const { organization, authContext, refreshAuth } = useAuth();
  const [formData, setFormData] = useState<UpdateOrganizationInput>({
    name: organization?.name || '',
    description: organization?.description || ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!organization || !authContext || authContext.role !== 'admin') {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">You don't have permission to view organization settings.</p>
        </CardContent>
      </Card>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await organizationsRepo.update(organization.id, formData);
      setSuccess('Organization updated successfully');
      await refreshAuth(); // Refresh to get updated data
    } catch (err: any) {
      setError(err.message || 'Failed to update organization');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: keyof UpdateOrganizationInput) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
    if (error) setError(null);
    if (success) setSuccess(null);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Organization Settings</CardTitle>
          <CardDescription>
            Manage your organization's basic information and settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Organization Name
              </label>
              <Input
                id="name"
                type="text"
                value={formData.name}
                onChange={handleInputChange('name')}
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="description" className="text-sm font-medium">
                Description
              </label>
              <Input
                id="description"
                type="text"
                value={formData.description || ''}
                onChange={handleInputChange('description')}
                placeholder="Brief description of your organization"
                disabled={isLoading}
              />
            </div>

            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                {error}
              </div>
            )}

            {success && (
              <div className="p-3 text-sm text-green-600 bg-green-50 border border-green-200 rounded-md">
                {success}
              </div>
            )}

            <Button
              type="submit"
              disabled={isLoading || !formData.name}
            >
              {isLoading ? 'Updating...' : 'Update Organization'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organization Information</CardTitle>
          <CardDescription>
            View your organization's details and identifiers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Organization ID</label>
            <p className="text-sm font-mono bg-gray-50 p-2 rounded border">
              {organization.uuid}
            </p>
          </div>
          
          <div>
            <label className="text-sm font-medium text-muted-foreground">Created</label>
            <p className="text-sm">
              {new Date(organization.created_at).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">Last Updated</label>
            <p className="text-sm">
              {new Date(organization.updated_at).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-red-600">Danger Zone</CardTitle>
          <CardDescription>
            Irreversible and destructive actions for your organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 border border-red-200 rounded-md">
              <h4 className="text-sm font-medium text-red-600 mb-2">Delete Organization</h4>
              <p className="text-sm text-muted-foreground mb-3">
                This will permanently delete your organization, all projects, and all associated data. This action cannot be undone.
              </p>
              <Button 
                variant="destructive" 
                size="sm"
                onClick={() => {
                  // TODO: Implement organization deletion with confirmation dialog
                  alert('Organization deletion not implemented yet');
                }}
              >
                Delete Organization
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
