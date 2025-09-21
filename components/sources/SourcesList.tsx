'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/components/auth/AuthProvider';
import { SourceRow, SourceType } from '@/src/auth/types';

interface SourcesListProps {
  onSourceSelect?: (source: SourceRow) => void;
  onCreateSource?: () => void;
  onEditSource?: (source: SourceRow) => void;
}

export function SourcesList({ onSourceSelect, onCreateSource, onEditSource }: SourcesListProps) {
  const { authContext } = useAuth();
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [filteredSources, setFilteredSources] = useState<SourceRow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<SourceType | 'all'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSources();
  }, [authContext?.organization_id]);

  useEffect(() => {
    filterSources();
  }, [sources, searchTerm, typeFilter]);

  const loadSources = async () => {
    if (!authContext?.organization_id) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/sources', {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch sources');
      }
      
      const data = await response.json();
      setSources(data.sources || []);
    } catch (err: any) {
      setError('Failed to load sources');
    } finally {
      setIsLoading(false);
    }
  };

  const filterSources = () => {
    let filtered = sources;

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(source =>
        source.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        source.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by type
    if (typeFilter !== 'all') {
      filtered = filtered.filter(source => source.type === typeFilter);
    }

    setFilteredSources(filtered);
  };

  const handleToggleActive = async (source: SourceRow) => {
    try {
      const response = await fetch(`/api/sources/${source.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          is_active: !source.is_active
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update source status');
      }
      
      await loadSources();
    } catch (err: any) {
      setError('Failed to update source status');
    }
  };

  const handleSync = async (source: SourceRow) => {
    try {
      const response = await fetch(`/api/sources/${source.id}/sync`, {
        method: 'POST',
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to trigger sync');
      }
      
      await loadSources();
      // TODO: Implement actual sync logic
      alert('Sync initiated (implementation pending)');
    } catch (err: any) {
      setError('Failed to initiate sync');
    }
  };

  const getTypeIcon = (type: SourceType) => {
    switch (type) {
      case 'github': return '🐙';
      case 'bitbucket': return '📦';
      case 'gitlab': return '🦊';
      case 'documentation': return '📚';
      case 'confluence': return '📋';
      case 'notion': return '📝';
      case 'file_upload': return '📁';
      default: return '🔗';
    }
  };

  const getTypeColor = (type: SourceType) => {
    switch (type) {
      case 'github': return 'bg-gray-100 text-gray-700';
      case 'bitbucket': return 'bg-blue-100 text-blue-700';
      case 'gitlab': return 'bg-orange-100 text-orange-700';
      case 'documentation': return 'bg-green-100 text-green-700';
      case 'confluence': return 'bg-purple-100 text-purple-700';
      case 'notion': return 'bg-black text-white';
      case 'file_upload': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-700';
      case 'syncing': return 'bg-blue-100 text-blue-700';
      case 'failed': return 'bg-red-100 text-red-700';
      case 'pending': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
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
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Data Sources</CardTitle>
              <CardDescription>
                Connect and manage your external data sources for knowledge indexing.
              </CardDescription>
            </div>
            {authContext.role !== 'viewer' && (
              <Button onClick={onCreateSource}>
                Add Source
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
              <Input
                placeholder="Search sources..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as SourceType | 'all')}
              className="px-3 py-2 border rounded-md"
            >
              <option value="all">All Types</option>
              <option value="github">GitHub</option>
              <option value="bitbucket">BitBucket</option>
              <option value="gitlab">GitLab</option>
              <option value="documentation">Documentation</option>
              <option value="confluence">Confluence</option>
              <option value="notion">Notion</option>
              <option value="file_upload">File Upload</option>
              <option value="other">Other</option>
            </select>
          </div>

          {error && (
            <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          {/* Sources List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
          ) : filteredSources.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">
                {searchTerm || typeFilter !== 'all' 
                  ? 'No sources found matching your filters.' 
                  : 'No data sources configured yet.'
                }
              </p>
              {!searchTerm && typeFilter === 'all' && authContext.role !== 'viewer' && (
                <Button onClick={onCreateSource}>
                  Add Your First Source
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSources.map((source) => (
                <Card
                  key={source.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => onSourceSelect?.(source)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        <span className="text-lg">{getTypeIcon(source.type)}</span>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTypeColor(source.type)}`}>
                          {source.type}
                        </span>
                      </div>
                      
                      <div className="flex items-center space-x-1">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeColor(source.sync_status)}`}>
                          {source.sync_status}
                        </span>
                        {!source.is_active && (
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                            Inactive
                          </span>
                        )}
                      </div>
                    </div>

                    <h3 className="font-medium mb-1">{source.name}</h3>
                    
                    {source.description && (
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                        {source.description}
                      </p>
                    )}

                    <div className="space-y-1 text-xs text-muted-foreground">
                      <p>Created {formatDate(source.created_at)}</p>
                      {source.last_synced_at && (
                        <p>Last synced {formatDate(source.last_synced_at)}</p>
                      )}
                    </div>

                    {source.sync_error && (
                      <div className="mt-2 p-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded">
                        Error: {source.sync_error}
                      </div>
                    )}

                    {authContext.role !== 'viewer' && (
                      <div className="flex items-center space-x-2 mt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSync(source);
                          }}
                          disabled={source.sync_status === 'syncing' || !source.is_active}
                        >
                          Sync
                        </Button>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditSource?.(source);
                          }}
                        >
                          Edit
                        </Button>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleActive(source);
                          }}
                        >
                          {source.is_active ? 'Disable' : 'Enable'}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
