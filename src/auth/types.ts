// src/auth/types.ts
export type OrganizationRow = {
  id: number;
  uuid: string;
  name: string;
  description: string | null;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type UserRole = 'admin' | 'member' | 'viewer';

export type UserRow = {
  id: number;
  auth_id: string; // Supabase auth.users.id
  organization_id: number;
  email: string;
  full_name: string | null;
  role: UserRole;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  deleted_at: string | null;
};

export type SourceType = 
  | 'github' 
  | 'bitbucket' 
  | 'gitlab' 
  | 'documentation' 
  | 'confluence' 
  | 'notion' 
  | 'file_upload'
  | 'other';

export type SyncStatus = 'pending' | 'syncing' | 'completed' | 'failed';

export type SourceRow = {
  id: number;
  uuid: string;
  organization_id: number;
  created_by: number;
  name: string;
  description: string | null;
  type: SourceType;
  config: Record<string, any>;
  is_active: boolean;
  last_synced_at: string | null;
  sync_status: SyncStatus;
  sync_error: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type IndexingStatus = 'pending' | 'indexing' | 'completed' | 'failed';

export type ProjectRow = {
  id: number;
  uuid: string;
  organization_id: number;
  source_id: number | null;
  created_by: number;
  name: string;
  description: string | null;
  settings: Record<string, any>;
  is_active: boolean;
  last_indexed_at: string | null;
  indexing_status: IndexingStatus;
  indexing_error: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

// Input types for creating/updating
export type CreateOrganizationInput = {
  name: string;
  description?: string;
  settings?: Record<string, any>;
};

export type UpdateOrganizationInput = Partial<CreateOrganizationInput>;

export type CreateUserInput = {
  auth_id: string;
  organization_id: number;
  email: string;
  full_name?: string;
  role?: UserRole;
  settings?: Record<string, any>;
};

export type UpdateUserInput = Partial<Omit<CreateUserInput, 'auth_id' | 'organization_id'>>;

export type CreateSourceInput = {
  organization_id: number;
  created_by: number;
  name: string;
  description?: string;
  type: SourceType;
  config: Record<string, any>;
  is_active?: boolean;
};

export type UpdateSourceInput = Partial<Omit<CreateSourceInput, 'organization_id' | 'created_by'>>;

export type CreateProjectInput = {
  organization_id: number;
  source_id?: number;
  created_by: number;
  name: string;
  description?: string;
  settings?: Record<string, any>;
  is_active?: boolean;
};

export type UpdateProjectInput = Partial<Omit<CreateProjectInput, 'organization_id' | 'created_by'>>;

// Extended filter types
export type OrganizationFilter = {
  mode: "all";
} | {
  mode: "by_id";
  id: number;
} | {
  mode: "by_uuid";
  uuid: string;
};

export type UserFilter = {
  mode: "all";
} | {
  mode: "by_organization";
  organization_id: number;
} | {
  mode: "by_auth_id";
  auth_id: string;
} | {
  mode: "by_id";
  id: number;
};

export type SourceFilter = {
  mode: "all";
} | {
  mode: "by_organization";
  organization_id: number;
} | {
  mode: "by_type";
  type: SourceType;
  organization_id?: number;
} | {
  mode: "by_id";
  id: number;
};

export type ProjectFilter = {
  mode: "all";
} | {
  mode: "by_organization";
  organization_id: number;
} | {
  mode: "by_source";
  source_id: number;
} | {
  mode: "by_id";
  id: number;
};

// Auth context type
export type AuthContext = {
  user_id: number;
  auth_id: string;
  organization_id: number;
  role: UserRole;
  email: string;
};
