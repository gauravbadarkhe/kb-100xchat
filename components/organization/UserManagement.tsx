'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/components/auth/AuthProvider';
import { AuthService } from '@/src/auth/service';
import { usersRepo } from '@/src/auth/repositories';
import { UserRow, UserRole } from '@/src/auth/types';

export function UserManagement() {
  const { authContext, organization } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('member');
  const [isLoading, setIsLoading] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canManageUsers = authContext?.role === 'admin';

  useEffect(() => {
    loadUsers();
  }, [authContext?.organization_id]);

  const loadUsers = async () => {
    if (!authContext?.organization_id) return;
    
    setIsLoading(true);
    try {
      const orgUsers = await AuthService.getOrganizationMembers(authContext.organization_id);
      setUsers(orgUsers);
    } catch (err: any) {
      setError('Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authContext || !canManageUsers) return;

    setIsInviting(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await AuthService.inviteUser({
        email: inviteEmail,
        role: inviteRole,
        organizationId: authContext.organization_id,
        invitedBy: authContext.user_id
      });

      if (result.success) {
        setSuccess(`Invitation sent to ${inviteEmail}`);
        setInviteEmail('');
        setInviteRole('member');
        await loadUsers(); // Refresh users list
      } else {
        setError(result.error || 'Failed to invite user');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to invite user');
    } finally {
      setIsInviting(false);
    }
  };

  const handleRoleChange = async (userId: number, newRole: UserRole) => {
    if (!authContext) return;

    try {
      const result = await AuthService.updateUserRole(userId, newRole, authContext);
      if (result.success) {
        setSuccess('User role updated successfully');
        await loadUsers(); // Refresh users list
      } else {
        setError(result.error || 'Failed to update user role');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update user role');
    }
  };

  const handleRemoveUser = async (userId: number, userEmail: string) => {
    if (!authContext) return;

    if (!confirm(`Are you sure you want to remove ${userEmail} from the organization?`)) {
      return;
    }

    try {
      const result = await AuthService.removeUser(userId, authContext);
      if (result.success) {
        setSuccess('User removed successfully');
        await loadUsers(); // Refresh users list
      } else {
        setError(result.error || 'Failed to remove user');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to remove user');
    }
  };

  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-700';
      case 'member': return 'bg-blue-100 text-blue-700';
      case 'viewer': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  if (!organization || !authContext) {
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
      {canManageUsers && (
        <Card>
          <CardHeader>
            <CardTitle>Invite Team Member</CardTitle>
            <CardDescription>
              Add new members to your organization.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleInviteUser} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label htmlFor="inviteEmail" className="text-sm font-medium">
                    Email Address
                  </label>
                  <Input
                    id="inviteEmail"
                    type="email"
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                    disabled={isInviting}
                  />
                </div>
                
                <div>
                  <label htmlFor="inviteRole" className="text-sm font-medium">
                    Role
                  </label>
                  <select
                    id="inviteRole"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as UserRole)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    disabled={isInviting}
                  >
                    <option value="viewer">Viewer</option>
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>

              <Button
                type="submit"
                disabled={isInviting || !inviteEmail}
              >
                {isInviting ? 'Sending invitation...' : 'Send Invitation'}
              </Button>
            </form>

            <div className="mt-4 text-xs text-muted-foreground space-y-1">
              <p><strong>Viewer:</strong> Can view and search content</p>
              <p><strong>Member:</strong> Can view, search, and manage projects</p>
              <p><strong>Admin:</strong> Full access including user and organization management</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Team Members ({users.length})</CardTitle>
          <CardDescription>
            Manage your organization's team members and their roles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 text-sm text-green-600 bg-green-50 border border-green-200 rounded-md">
              {success}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
          ) : users.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No team members found.
            </p>
          ) : (
            <div className="space-y-4">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center space-x-4">
                    <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                      <span className="text-sm font-medium text-gray-600">
                        {(user.full_name || user.email).charAt(0).toUpperCase()}
                      </span>
                    </div>
                    
                    <div>
                      <p className="font-medium">
                        {user.full_name || 'No name provided'}
                        {user.id === authContext.user_id && (
                          <span className="ml-2 text-xs text-muted-foreground">(You)</span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                      {user.last_login_at && (
                        <p className="text-xs text-muted-foreground">
                          Last login: {new Date(user.last_login_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getRoleBadgeColor(user.role)}`}>
                      {user.role}
                    </span>

                    {canManageUsers && user.id !== authContext.user_id && (
                      <div className="flex items-center space-x-2">
                        <select
                          value={user.role}
                          onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                          className="text-xs border rounded px-2 py-1"
                        >
                          <option value="viewer">Viewer</option>
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                        
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleRemoveUser(user.id, user.email)}
                        >
                          Remove
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
