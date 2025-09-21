'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/components/auth/AuthProvider';
import { ProjectRow, SourceRow } from '@/src/auth/types';

interface ProjectFormProps {
  project?: ProjectRow; // If provided, it's edit mode
  onSuccess?: (project: ProjectRow) => void;
  onCancel?: () => void;
}

export function ProjectForm({ project, onSuccess, onCancel }: ProjectFormProps) {
  const { authContext } = useAuth();
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    source_id: number | null;
    settings: Record<string, any>;
  }>({
    name: project?.name || '',
    description: project?.description || '',
    source_id: project?.source_id || null,
    settings: project?.settings || {
      ignoredFiles: ['node_modules', '.git', 'dist', 'build'],
      includedBranches: ['main', 'master', 'develop'],
      maxFileSize: 1024 * 1024, // 1MB
      autoIndex: true
    }
  });
  
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditMode = !!project;

  useEffect(() => {
    loadSources();
  }, [authContext?.organization_id]);

  const loadSources = async () => {
    if (!authContext?.organization_id) return;

    try {
      const response = await fetch('/api/sources', {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch sources');
      }
      
      const data = await response.json();
      const activeSources = (data.sources || []).filter((s: any) => s.is_active);
      setSources(activeSources);
    } catch (err) {
      console.error('Failed to load sources:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authContext) return;

    setIsLoading(true);
    setError(null);

    try {
      let savedProject: ProjectRow;

      if (isEditMode && project) {
        // Update existing project via API
        const response = await fetch(`/api/projects/${project.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            name: formData.name,
            description: formData.description || undefined,
            source_id: formData.source_id || undefined,
            settings: formData.settings
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to update project');
        }

        savedProject = await response.json();
      } else {
        // Create new project via API
        const response = await fetch('/api/projects', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            name: formData.name,
            description: formData.description || undefined,
            source_id: formData.source_id || undefined,
            settings: formData.settings
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to create project');
        }

        savedProject = await response.json();
      }

      onSuccess?.(savedProject);
    } catch (err: any) {
      setError(err.message || `Failed to ${isEditMode ? 'update' : 'create'} project`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = e.target.type === 'number' ? Number(e.target.value) : e.target.value;
    
    if (field.startsWith('settings.')) {
      const settingKey = field.split('.')[1];
      setFormData(prev => ({
        ...prev,
        settings: {
          ...prev.settings,
          [settingKey]: value
        }
      }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
    
    if (error) setError(null);
  };

  const handleArrayInputChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.split(',').map(s => s.trim()).filter(s => s);
    setFormData(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        [field]: value
      }
    }));
  };

  if (!authContext) return null;

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{isEditMode ? 'Edit Project' : 'Create New Project'}</CardTitle>
        <CardDescription>
          {isEditMode 
            ? 'Update your project settings and configuration.'
            : 'Set up a new knowledge base project to index and search your content.'
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
                Project Name *
              </label>
              <Input
                id="name"
                type="text"
                value={formData.name}
                onChange={handleInputChange('name')}
                placeholder="My Knowledge Base"
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
                placeholder="Brief description of what this project contains..."
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="source_id" className="text-sm font-medium">
                Data Source
              </label>
              <select
                id="source_id"
                value={formData.source_id || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, source_id: e.target.value ? Number(e.target.value) : null }))}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                disabled={isLoading}
              >
                <option value="">No source (manual upload)</option>
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name} ({source.type})
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Optional: Connect to a data source for automatic syncing
              </p>
            </div>
          </div>

          {/* Project Settings */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Project Settings</h3>
            
            <div className="space-y-2">
              <label htmlFor="ignoredFiles" className="text-sm font-medium">
                Ignored Files/Directories
              </label>
              <Input
                id="ignoredFiles"
                type="text"
                value={formData.settings.ignoredFiles?.join(', ') || ''}
                onChange={handleArrayInputChange('ignoredFiles')}
                placeholder="node_modules, .git, dist, build"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated list of files/directories to ignore during indexing
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="includedBranches" className="text-sm font-medium">
                Included Branches
              </label>
              <Input
                id="includedBranches"
                type="text"
                value={formData.settings.includedBranches?.join(', ') || ''}
                onChange={handleArrayInputChange('includedBranches')}
                placeholder="main, master, develop"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated list of branches to index (for Git sources)
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="maxFileSize" className="text-sm font-medium">
                Max File Size (bytes)
              </label>
              <Input
                id="maxFileSize"
                type="number"
                value={formData.settings.maxFileSize || 1048576}
                onChange={handleInputChange('settings.maxFileSize')}
                min="1024"
                max="10485760"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Maximum file size to index (1MB = 1048576 bytes)
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <input
                id="autoIndex"
                type="checkbox"
                checked={formData.settings.autoIndex || false}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  settings: {
                    ...prev.settings,
                    autoIndex: e.target.checked
                  }
                }))}
                disabled={isLoading}
                className="rounded border-input"
              />
              <label htmlFor="autoIndex" className="text-sm font-medium">
                Enable automatic indexing
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Automatically re-index content when changes are detected
            </p>
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
                (isEditMode ? 'Update Project' : 'Create Project')
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
