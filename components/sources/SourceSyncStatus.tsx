'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, RefreshCw, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
import { SourceRow } from '@/src/auth/types';

interface SourceSyncStatusProps {
  source: SourceRow;
  onSyncTriggered?: () => void;
}

export function SourceSyncStatus({ source, onSyncTriggered }: SourceSyncStatusProps) {
  const [isTriggering, setIsTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTriggerSync = async () => {
    setIsTriggering(true);
    setError(null);

    try {
      const response = await fetch(`/api/sources/${source.id}/sync`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to trigger sync');
      }

      onSyncTriggered?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsTriggering(false);
    }
  };

  const getSyncStatusIcon = () => {
    switch (source.sync_status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'syncing':
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'pending':
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getSyncStatusText = () => {
    switch (source.sync_status) {
      case 'completed':
        return 'Completed';
      case 'syncing':
        return 'Syncing...';
      case 'failed':
        return 'Failed';
      case 'pending':
      default:
        return 'Pending';
    }
  };

  const getSyncStatusColor = () => {
    switch (source.sync_status) {
      case 'completed':
        return 'text-green-600';
      case 'syncing':
        return 'text-blue-600';
      case 'failed':
        return 'text-red-600';
      case 'pending':
      default:
        return 'text-gray-600';
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const canTriggerSync = source.type === 'github' && 
                        source.is_active && 
                        source.sync_status !== 'syncing' &&
                        source.config.installation_id &&
                        source.config.repository;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <RefreshCw className="h-5 w-5" />
          <span>Sync Status</span>
        </CardTitle>
        <CardDescription>
          Current synchronization status for this source
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {getSyncStatusIcon()}
            <span className={`font-medium ${getSyncStatusColor()}`}>
              {getSyncStatusText()}
            </span>
          </div>
          
          {canTriggerSync && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleTriggerSync}
              disabled={isTriggering}
            >
              {isTriggering ? (
                <>
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  Triggering...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-3 w-3" />
                  Sync Now
                </>
              )}
            </Button>
          )}
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Last Synced:</span>
            <span>{formatDate(source.last_synced_at)}</span>
          </div>
          
          {source.sync_error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <div className="flex items-start space-x-2">
                <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-red-600 font-medium text-sm">Sync Error</p>
                  <p className="text-red-700 text-xs mt-1">{source.sync_error}</p>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <div className="flex items-start space-x-2">
                <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-red-600 font-medium text-sm">Action Error</p>
                  <p className="text-red-700 text-xs mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}

          {!canTriggerSync && source.type === 'github' && (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
              <p className="text-gray-600 text-xs">
                {!source.is_active ? 'Source is inactive' :
                 source.sync_status === 'syncing' ? 'Sync already in progress' :
                 !source.config.installation_id ? 'GitHub App not configured' :
                 'Manual sync not available'}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
