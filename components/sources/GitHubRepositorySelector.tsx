'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Github, ExternalLink, Search, Check } from 'lucide-react';

interface Repository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  default_branch: string;
  language: string | null;
  size: number;
  updated_at: string;
}

interface Installation {
  id: number;
  account: {
    login: string;
    avatar_url: string;
    type: string;
  };
  app_slug: string;
  permissions: Record<string, string>;
}

interface GitHubData {
  installation: Installation;
  repositories: Repository[];
  total_count: number;
}

interface GitHubRepositorySelectorProps {
  onRepositorySelect: (repository: Repository, installationId: number) => void;
  onCancel: () => void;
  selectedRepository?: string; // full_name of selected repo
}

export function GitHubRepositorySelector({ 
  onRepositorySelect, 
  onCancel, 
  selectedRepository 
}: GitHubRepositorySelectorProps) {
  const [step, setStep] = useState<'install' | 'select'>('install');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gitHubData, setGitHubData] = useState<GitHubData | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredRepos, setFilteredRepos] = useState<Repository[]>([]);

  // Filter repositories based on search term
  useEffect(() => {
    if (!gitHubData) return;
    
    if (!searchTerm) {
      setFilteredRepos(gitHubData.repositories);
      return;
    }

    const filtered = gitHubData.repositories.filter(repo =>
      repo.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      repo.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (repo.description && repo.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    setFilteredRepos(filtered);
  }, [gitHubData, searchTerm]);

  const handleInstallGitHubApp = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/github');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get GitHub installation URL');
      }

      // Open GitHub App installation in new tab
      window.open(data.installation_url, '_blank');
      
      // You could also set up a polling mechanism or use postMessage to detect completion
      // For now, we'll show a message to the user
      setStep('select');
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInstallationComplete = async (installationId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/sources/github/repositories?installation_id=${installationId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch repositories');
      }

      setGitHubData(data);
      setStep('select');
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRepositoryClick = (repository: Repository) => {
    if (!gitHubData) return;
    onRepositorySelect(repository, gitHubData.installation.id);
  };

  const handleBulkInstall = async (selectedRepos: Repository[]) => {
    if (!gitHubData || selectedRepos.length === 0) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/sources/github/install', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          installation_id: gitHubData.installation.id,
          repositories: selectedRepos
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to install repositories');
      }

      // Show success message or redirect
      alert(`Successfully installed ${data.created_sources.length} repositories!`);
      onCancel(); // Close the selector
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const formatSize = (size: number) => {
    if (size < 1024) return `${size} KB`;
    return `${(size / 1024).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (step === 'install') {
    return (
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Github size={48} className="text-gray-700" />
          </div>
          <CardTitle>Connect GitHub Account</CardTitle>
          <CardDescription>
            Install the TNEGA AI GitHub App to access your repositories
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-6">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              The GitHub App will allow you to:
            </p>
            <ul className="text-sm text-left max-w-md mx-auto space-y-2">
              <li className="flex items-center space-x-2">
                <Check size={16} className="text-green-600" />
                <span>Access repository contents</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check size={16} className="text-green-600" />
                <span>Receive webhook notifications for changes</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check size={16} className="text-green-600" />
                <span>Automatically sync code and documentation</span>
              </li>
            </ul>
          </div>

          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <Button
              onClick={handleInstallGitHubApp}
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Getting installation URL...
                </>
              ) : (
                <>
                  <Github className="mr-2 h-4 w-4" />
                  Install GitHub App
                  <ExternalLink className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>

            <div className="text-sm text-muted-foreground">
              <p>After installing the app, you'll be able to select repositories to sync.</p>
            </div>

            {/* Manual installation ID entry for debugging */}
            <div className="pt-4 border-t">
              <p className="text-xs text-muted-foreground mb-2">
                Already installed? Enter your installation ID:
              </p>
              <div className="flex space-x-2">
                <Input
                  placeholder="Installation ID"
                  onChange={(e) => {
                    if (e.target.value.trim()) {
                      handleInstallationComplete(e.target.value.trim());
                    }
                  }}
                  className="text-sm"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-center space-x-3">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Github size={20} />
          <span>Select GitHub Repository</span>
        </CardTitle>
        <CardDescription>
          Choose a repository to sync from {gitHubData?.installation.account.login}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
            {error}
          </div>
        )}

        <div className="flex items-center space-x-2">
          <Search size={16} className="text-muted-foreground" />
          <Input
            placeholder="Search repositories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1"
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredRepos.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchTerm ? 'No repositories match your search.' : 'No repositories available.'}
              </div>
            ) : (
              filteredRepos.map((repo) => (
                <div
                  key={repo.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors hover:bg-muted/50 ${
                    selectedRepository === repo.full_name ? 'border-primary bg-primary/5' : ''
                  }`}
                  onClick={() => handleRepositoryClick(repo)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <h4 className="font-medium text-sm truncate">{repo.full_name}</h4>
                        {repo.private && (
                          <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-800 rounded">
                            Private
                          </span>
                        )}
                        {selectedRepository === repo.full_name && (
                          <Check size={16} className="text-primary" />
                        )}
                      </div>
                      {repo.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {repo.description}
                        </p>
                      )}
                      <div className="flex items-center space-x-4 mt-2 text-xs text-muted-foreground">
                        {repo.language && (
                          <span className="flex items-center space-x-1">
                            <div 
                              className="w-2 h-2 rounded-full" 
                              style={{ backgroundColor: getLanguageColor(repo.language) }}
                            />
                            <span>{repo.language}</span>
                          </span>
                        )}
                        <span>Size: {formatSize(repo.size)}</span>
                        <span>Updated: {formatDate(repo.updated_at)}</span>
                        <span>Default branch: {repo.default_branch}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          
          <div className="text-sm text-muted-foreground">
            {gitHubData?.total_count} repositories available
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Helper function to get language colors (simplified)
function getLanguageColor(language: string): string {
  const colors: Record<string, string> = {
    TypeScript: '#3178c6',
    JavaScript: '#f1e05a',
    Python: '#3572A5',
    Java: '#b07219',
    'C#': '#239120',
    Go: '#00ADD8',
    Rust: '#dea584',
    Ruby: '#701516',
    PHP: '#4F5D95',
    Shell: '#89e051',
    HTML: '#e34c26',
    CSS: '#1572B6',
    Vue: '#4FC08D',
    React: '#61DAFB',
  };
  
  return colors[language] || '#8b5cf6';
}
