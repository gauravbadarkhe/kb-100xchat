'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/components/auth/AuthProvider';
import { sourcesRepo } from '@/src/auth/repositories';
import { SourceRow, SourceType, CreateSourceInput, UpdateSourceInput } from '@/src/auth/types';

interface SourceFormProps {
  source?: SourceRow; // If provided, it's edit mode
  onSuccess?: (source: SourceRow) => void;
  onCancel?: () => void;
}

export function SourceForm({ source, onSuccess, onCancel }: SourceFormProps) {
  const { authContext } = useAuth();
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    type: SourceType;
    config: Record<string, any>;
  }>({
    name: source?.name || '',
    description: source?.description || '',
    type: source?.type || 'github',
    config: source?.config || {}
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditMode = !!source;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authContext) return;

    setIsLoading(true);
    setError(null);

    try {
      let savedSource: SourceRow;

      if (isEditMode && source) {
        // Update existing source
        const updateData: UpdateSourceInput = {
          name: formData.name,
          description: formData.description || undefined,
          type: formData.type,
          config: formData.config
        };
        savedSource = await sourcesRepo.update(source.id, updateData);
      } else {
        // Create new source
        const createData: CreateSourceInput = {
          organization_id: authContext.organization_id,
          created_by: authContext.user_id,
          name: formData.name,
          description: formData.description || undefined,
          type: formData.type,
          config: formData.config
        };
        savedSource = await sourcesRepo.create(createData);
      }

      onSuccess?.(savedSource);
    } catch (err: any) {
      setError(err.message || `Failed to ${isEditMode ? 'update' : 'create'} source`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    
    if (field.startsWith('config.')) {
      const configKey = field.split('.')[1];
      setFormData(prev => ({
        ...prev,
        config: {
          ...prev.config,
          [configKey]: value
        }
      }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
    
    if (error) setError(null);
  };

  const renderConfigFields = () => {
    switch (formData.type) {
      case 'github':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="token" className="text-sm font-medium">
                GitHub Access Token *
              </label>
              <Input
                id="token"
                type="password"
                value={formData.config.token || ''}
                onChange={handleInputChange('config.token')}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                required
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Create a personal access token with repo access at github.com/settings/tokens
              </p>
            </div>
            
            <div className="space-y-2">
              <label htmlFor="repository" className="text-sm font-medium">
                Repository *
              </label>
              <Input
                id="repository"
                type="text"
                value={formData.config.repository || ''}
                onChange={handleInputChange('config.repository')}
                placeholder="owner/repository-name"
                required
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Format: owner/repository-name (e.g., facebook/react)
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="branch" className="text-sm font-medium">
                Default Branch
              </label>
              <Input
                id="branch"
                type="text"
                value={formData.config.branch || 'main'}
                onChange={handleInputChange('config.branch')}
                placeholder="main"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="path" className="text-sm font-medium">
                Path Filter
              </label>
              <Input
                id="path"
                type="text"
                value={formData.config.path || ''}
                onChange={handleInputChange('config.path')}
                placeholder="docs/ (optional - leave empty for entire repo)"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Optional: Specify a directory to index (e.g., docs/, src/)
              </p>
            </div>
          </div>
        );

      case 'bitbucket':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-medium">
                Username *
              </label>
              <Input
                id="username"
                type="text"
                value={formData.config.username || ''}
                onChange={handleInputChange('config.username')}
                placeholder="your-username"
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="app_password" className="text-sm font-medium">
                App Password *
              </label>
              <Input
                id="app_password"
                type="password"
                value={formData.config.app_password || ''}
                onChange={handleInputChange('config.app_password')}
                placeholder="App password from Bitbucket settings"
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="repository" className="text-sm font-medium">
                Repository *
              </label>
              <Input
                id="repository"
                type="text"
                value={formData.config.repository || ''}
                onChange={handleInputChange('config.repository')}
                placeholder="workspace/repository-name"
                required
                disabled={isLoading}
              />
            </div>
          </div>
        );

      case 'gitlab':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="token" className="text-sm font-medium">
                GitLab Access Token *
              </label>
              <Input
                id="token"
                type="password"
                value={formData.config.token || ''}
                onChange={handleInputChange('config.token')}
                placeholder="glpat-xxxxxxxxxxxxxxxxxxxx"
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="project_id" className="text-sm font-medium">
                Project ID *
              </label>
              <Input
                id="project_id"
                type="text"
                value={formData.config.project_id || ''}
                onChange={handleInputChange('config.project_id')}
                placeholder="12345678"
                required
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Find this in your GitLab project settings
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="gitlab_url" className="text-sm font-medium">
                GitLab URL
              </label>
              <Input
                id="gitlab_url"
                type="text"
                value={formData.config.gitlab_url || 'https://gitlab.com'}
                onChange={handleInputChange('config.gitlab_url')}
                placeholder="https://gitlab.com"
                disabled={isLoading}
              />
            </div>
          </div>
        );

      case 'documentation':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="url" className="text-sm font-medium">
                Documentation URL *
              </label>
              <Input
                id="url"
                type="url"
                value={formData.config.url || ''}
                onChange={handleInputChange('config.url')}
                placeholder="https://docs.example.com"
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="crawl_depth" className="text-sm font-medium">
                Crawl Depth
              </label>
              <Input
                id="crawl_depth"
                type="number"
                value={formData.config.crawl_depth || 3}
                onChange={handleInputChange('config.crawl_depth')}
                min="1"
                max="10"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                How many levels deep to crawl links (1-10)
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <input
                id="follow_external"
                type="checkbox"
                checked={formData.config.follow_external || false}
                onChange={handleInputChange('config.follow_external')}
                disabled={isLoading}
                className="rounded border-input"
              />
              <label htmlFor="follow_external" className="text-sm font-medium">
                Follow external links
              </label>
            </div>
          </div>
        );

      case 'confluence':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="base_url" className="text-sm font-medium">
                Confluence Base URL *
              </label>
              <Input
                id="base_url"
                type="url"
                value={formData.config.base_url || ''}
                onChange={handleInputChange('config.base_url')}
                placeholder="https://yourcompany.atlassian.net"
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-medium">
                Username *
              </label>
              <Input
                id="username"
                type="text"
                value={formData.config.username || ''}
                onChange={handleInputChange('config.username')}
                placeholder="your-email@company.com"
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="api_token" className="text-sm font-medium">
                API Token *
              </label>
              <Input
                id="api_token"
                type="password"
                value={formData.config.api_token || ''}
                onChange={handleInputChange('config.api_token')}
                placeholder="API token from Atlassian account settings"
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="space_key" className="text-sm font-medium">
                Space Key
              </label>
              <Input
                id="space_key"
                type="text"
                value={formData.config.space_key || ''}
                onChange={handleInputChange('config.space_key')}
                placeholder="SPACEKEY (optional - leave empty for all spaces)"
                disabled={isLoading}
              />
            </div>
          </div>
        );

      case 'notion':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="integration_token" className="text-sm font-medium">
                Integration Token *
              </label>
              <Input
                id="integration_token"
                type="password"
                value={formData.config.integration_token || ''}
                onChange={handleInputChange('config.integration_token')}
                placeholder="secret_xxxxxxxxxxxxxxxxxxxxxxxx"
                required
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Create an integration at notion.so/my-integrations
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="database_id" className="text-sm font-medium">
                Database ID
              </label>
              <Input
                id="database_id"
                type="text"
                value={formData.config.database_id || ''}
                onChange={handleInputChange('config.database_id')}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (optional)"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Optional: Specific database to sync (leave empty for all accessible content)
              </p>
            </div>
          </div>
        );

      case 'file_upload':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="allowed_extensions" className="text-sm font-medium">
                Allowed File Extensions
              </label>
              <Input
                id="allowed_extensions"
                type="text"
                value={formData.config.allowed_extensions || '.md,.txt,.pdf,.docx'}
                onChange={handleInputChange('config.allowed_extensions')}
                placeholder=".md,.txt,.pdf,.docx"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated list of allowed file extensions
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="max_file_size" className="text-sm font-medium">
                Max File Size (MB)
              </label>
              <Input
                id="max_file_size"
                type="number"
                value={formData.config.max_file_size || 10}
                onChange={handleInputChange('config.max_file_size')}
                min="1"
                max="100"
                disabled={isLoading}
              />
            </div>
          </div>
        );

      default:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="url" className="text-sm font-medium">
                URL or Endpoint
              </label>
              <Input
                id="url"
                type="text"
                value={formData.config.url || ''}
                onChange={handleInputChange('config.url')}
                placeholder="Configuration URL or endpoint"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="api_key" className="text-sm font-medium">
                API Key or Token
              </label>
              <Input
                id="api_key"
                type="password"
                value={formData.config.api_key || ''}
                onChange={handleInputChange('config.api_key')}
                placeholder="API key or authentication token"
                disabled={isLoading}
              />
            </div>
          </div>
        );
    }
  };

  if (!authContext) return null;

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{isEditMode ? 'Edit Data Source' : 'Add New Data Source'}</CardTitle>
        <CardDescription>
          {isEditMode 
            ? 'Update your data source configuration.'
            : 'Connect a new data source to automatically sync content into your knowledge base.'
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Basic Information</h3>
            
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Source Name *
              </label>
              <Input
                id="name"
                type="text"
                value={formData.name}
                onChange={handleInputChange('name')}
                placeholder="My GitHub Repository"
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="description" className="text-sm font-medium">
                Description
              </label>
              <textarea
                id="description"
                value={formData.description}
                onChange={handleInputChange('description')}
                placeholder="Brief description of this data source..."
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="type" className="text-sm font-medium">
                Source Type *
              </label>
              <select
                id="type"
                value={formData.type}
                onChange={handleInputChange('type')}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                disabled={isLoading || isEditMode} // Don't allow changing type when editing
              >
                <option value="github">GitHub</option>
                <option value="bitbucket">BitBucket</option>
                <option value="gitlab">GitLab</option>
                <option value="documentation">Documentation Site</option>
                <option value="confluence">Confluence</option>
                <option value="notion">Notion</option>
                <option value="file_upload">File Upload</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          {/* Source-specific Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Configuration</h3>
            {renderConfigFields()}
          </div>

          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          <div className="flex items-center space-x-3">
            <Button
              type="submit"
              disabled={isLoading || !formData.name}
            >
              {isLoading ? 
                (isEditMode ? 'Updating...' : 'Creating...') : 
                (isEditMode ? 'Update Source' : 'Create Source')
              }
            </Button>
            
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isLoading}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
