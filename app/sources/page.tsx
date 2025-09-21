'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Github, Globe, FileText, Settings, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { AuthFlow } from '@/components/auth/AuthFlow';
import { SourceForm } from '@/components/sources/SourceForm';
import { SourceSyncStatus } from '@/components/sources/SourceSyncStatus';
import { SourceRow } from '@/src/auth/types';

export default function SourcesPage() {
  const { authContext } = useAuth();
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedSource, setSelectedSource] = useState<SourceRow | undefined>();
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  // If not authenticated, show auth flow
  if (!authContext) {
    return <AuthFlow />;
  }

  const fetchSources = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/sources', {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch sources');
      }

      const data = await response.json();
      setSources(data.sources || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSources();
  }, []);

  const handleSourceSuccess = (source: SourceRow) => {
    setShowAddForm(false);
    setSelectedSource(undefined);
    fetchSources(); // Refresh the list
  };

  const handleEditSource = (source: SourceRow) => {
    setSelectedSource(source);
    setShowAddForm(true);
  };

  const getSourceIcon = (type: string) => {
    switch (type) {
      case 'github':
        return <Github className="h-4 w-4" />;
      case 'documentation':
        return <Globe className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'syncing':
        return 'bg-blue-100 text-blue-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredSources = sources.filter(source =>
    source.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    source.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (source.description && source.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Show source form
  if (showAddForm) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowAddForm(false);
                setSelectedSource(undefined);
              }}
            >
              ← Back to Sources
            </Button>
          </div>
          
          <SourceForm
            source={selectedSource}
            onSuccess={handleSourceSuccess}
            onCancel={() => {
              setShowAddForm(false);
              setSelectedSource(undefined);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="mb-4">
            <Button
              variant="ghost"
              onClick={() => window.location.href = '/'}
            >
              ← Back to Chat
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Data Sources</h1>
              <p className="text-muted-foreground mt-2">
                Connect and manage your knowledge sources
              </p>
            </div>
            
            <Button onClick={() => setShowAddForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Source
            </Button>
          </div>
        </div>

        {/* Search and Actions */}
        <div className="flex items-center space-x-4 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search sources..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <Button variant="outline" onClick={fetchSources} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Error State */}
        {error && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="text-red-600 text-center">
                <p className="font-medium">Error loading sources</p>
                <p className="text-sm mt-1">{error}</p>
                <Button variant="outline" onClick={fetchSources} className="mt-3">
                  Try Again
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {isLoading && sources.length === 0 && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        )}

        {/* Empty State */}
        {!isLoading && filteredSources.length === 0 && !error && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-8">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No data sources found</h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm ? 'No sources match your search criteria.' : 'Get started by adding your first data source.'}
                </p>
                {!searchTerm && (
                  <Button onClick={() => setShowAddForm(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Your First Source
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Sources Grid */}
        {!isLoading && filteredSources.length > 0 && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredSources.map((source) => (
              <Card key={source.id} className="relative">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2">
                      {getSourceIcon(source.type)}
                      <CardTitle className="text-lg">{source.name}</CardTitle>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Badge variant={source.is_active ? 'default' : 'secondary'}>
                        {source.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </div>
                  
                  <CardDescription>
                    {source.description || `${source.type} source`}
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Type:</span>
                    <Badge variant="outline" className="capitalize">
                      {source.type}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Status:</span>
                    <Badge 
                      variant="outline" 
                      className={`capitalize ${getStatusColor(source.sync_status)}`}
                    >
                      {source.sync_status}
                    </Badge>
                  </div>
                  
                  {source.last_synced_at && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Last sync:</span>
                      <span className="text-xs">
                        {new Date(source.last_synced_at).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  
                  <div className="flex items-center space-x-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditSource(source)}
                    >
                      <Settings className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    
                    {source.type === 'github' && source.is_active && (
                      <div className="flex-1">
                        <SourceSyncStatus 
                          source={source} 
                          onSyncTriggered={() => fetchSources()}
                        />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Summary */}
        {!isLoading && sources.length > 0 && (
          <div className="mt-8 pt-6 border-t">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {filteredSources.length} of {sources.length} sources
              </span>
              <span>
                {sources.filter(s => s.is_active).length} active sources
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
