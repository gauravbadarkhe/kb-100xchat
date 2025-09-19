'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/components/auth/AuthProvider';
import { projectsRepo } from '@/src/auth/repositories';
import { ProjectRow } from '@/src/auth/types';

interface ProjectsListProps {
  onProjectSelect?: (project: ProjectRow) => void;
  onCreateProject?: () => void;
}

export function ProjectsList({ onProjectSelect, onCreateProject }: ProjectsListProps) {
  const { authContext } = useAuth();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectStats, setProjectStats] = useState({
    total: 0,
    active: 0,
    indexing: 0,
    failed: 0
  });

  useEffect(() => {
    loadProjects();
    loadStats();
  }, [authContext?.organization_id]);

  useEffect(() => {
    // Filter projects when search term changes
    if (searchTerm && authContext?.organization_id) {
      searchProjects();
    } else {
      loadProjects();
    }
  }, [searchTerm]);

  const loadProjects = async () => {
    if (!authContext?.organization_id) return;

    setIsLoading(true);
    try {
      const orgProjects = await projectsRepo.findByOrganization(authContext.organization_id, {
        sort: [{ field: 'created_at', direction: 'DESC' }]
      });
      setProjects(orgProjects);
    } catch (err: any) {
      setError('Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  };

  const searchProjects = async () => {
    if (!authContext?.organization_id || !searchTerm) return;

    setIsLoading(true);
    try {
      const searchResults = await projectsRepo.searchByName(searchTerm, authContext.organization_id);
      setProjects(searchResults);
    } catch (err: any) {
      setError('Failed to search projects');
    } finally {
      setIsLoading(false);
    }
  };

  const loadStats = async () => {
    if (!authContext?.organization_id) return;

    try {
      const stats = await projectsRepo.getProjectStats(authContext.organization_id);
      setProjectStats(stats);
    } catch (err) {
      console.error('Failed to load project stats:', err);
    }
  };

  const handleToggleActive = async (project: ProjectRow) => {
    try {
      await projectsRepo.toggleActive(project.id);
      await loadProjects();
      await loadStats();
    } catch (err: any) {
      setError('Failed to update project status');
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-700';
      case 'indexing': return 'bg-blue-100 text-blue-700';
      case 'failed': return 'bg-red-100 text-red-700';
      case 'pending': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (!authContext) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Project Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{projectStats.total}</div>
            <p className="text-xs text-muted-foreground">Total Projects</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">{projectStats.active}</div>
            <p className="text-xs text-muted-foreground">Active Projects</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-600">{projectStats.indexing}</div>
            <p className="text-xs text-muted-foreground">Indexing</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-red-600">{projectStats.failed}</div>
            <p className="text-xs text-muted-foreground">Failed</p>
          </CardContent>
        </Card>
      </div>

      {/* Project Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Projects</CardTitle>
              <CardDescription>
                Manage your knowledge base projects and data sources.
              </CardDescription>
            </div>
            {authContext.role !== 'viewer' && (
              <Button onClick={onCreateProject}>
                Create Project
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="mb-6">
            <Input
              placeholder="Search projects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {error && (
            <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          {/* Projects List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">
                {searchTerm ? 'No projects found matching your search.' : 'No projects yet.'}
              </p>
              {!searchTerm && authContext.role !== 'viewer' && (
                <Button onClick={onCreateProject}>
                  Create Your First Project
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
                  onClick={() => onProjectSelect?.(project)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="font-medium">{project.name}</h3>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeColor(project.indexing_status)}`}>
                          {project.indexing_status}
                        </span>
                        {!project.is_active && (
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                            Inactive
                          </span>
                        )}
                      </div>
                      
                      {project.description && (
                        <p className="text-sm text-muted-foreground mb-2">
                          {project.description}
                        </p>
                      )}

                      <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                        <span>Created {formatDate(project.created_at)}</span>
                        {project.last_indexed_at && (
                          <span>Last indexed {formatDate(project.last_indexed_at)}</span>
                        )}
                        {project.source_id && (
                          <span>Connected to source</span>
                        )}
                      </div>

                      {project.indexing_error && (
                        <div className="mt-2 p-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded">
                          Error: {project.indexing_error}
                        </div>
                      )}
                    </div>

                    {authContext.role !== 'viewer' && (
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleActive(project);
                          }}
                        >
                          {project.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
