// src/auth/repositories.ts
// Repository classes for authentication and organization models

import { BaseCRUD, FilterCondition, QueryOptions } from '../db/crud';
import {
  OrganizationRow,
  UserRow,
  SourceRow,
  ProjectRow,
  CreateOrganizationInput,
  UpdateOrganizationInput,
  CreateUserInput,
  UpdateUserInput,
  CreateSourceInput,
  UpdateSourceInput,
  CreateProjectInput,
  UpdateProjectInput,
  OrganizationFilter,
  UserFilter,
  SourceFilter,
  ProjectFilter,
  UserRole,
  SourceType
} from './types';

export class OrganizationsRepository extends BaseCRUD<OrganizationRow, CreateOrganizationInput, UpdateOrganizationInput> {
  constructor() {
    super('organizations');
  }

  async findByUuid(uuid: string): Promise<OrganizationRow | null> {
    return this.findOne([{ field: 'uuid', operator: '=', value: uuid }]);
  }

  async findByName(name: string): Promise<OrganizationRow | null> {
    return this.findOne([{ field: 'name', operator: '=', value: name }]);
  }

  async searchByName(searchTerm: string, options: QueryOptions = {}): Promise<OrganizationRow[]> {
    const filters: FilterCondition[] = [
      { field: 'name', operator: 'ILIKE', value: `%${searchTerm}%` }
    ];
    return this.findAll({ ...options, filters: [...(options.filters || []), ...filters] });
  }
}

export class UsersRepository extends BaseCRUD<UserRow, CreateUserInput, UpdateUserInput> {
  constructor() {
    super('users');
  }

  async findByAuthId(authId: string): Promise<UserRow | null> {
    return this.findOne([{ field: 'auth_id', operator: '=', value: authId }]);
  }

  async findByEmail(email: string, organizationId?: number): Promise<UserRow | null> {
    const filters: FilterCondition[] = [{ field: 'email', operator: '=', value: email }];
    if (organizationId) {
      filters.push({ field: 'organization_id', operator: '=', value: organizationId });
    }
    return this.findOne(filters);
  }

  async findByOrganization(organizationId: number, options: QueryOptions = {}): Promise<UserRow[]> {
    const filters: FilterCondition[] = [
      { field: 'organization_id', operator: '=', value: organizationId }
    ];
    return this.findAll({ ...options, filters: [...(options.filters || []), ...filters] });
  }

  async findByRole(role: UserRole, organizationId?: number, options: QueryOptions = {}): Promise<UserRow[]> {
    const filters: FilterCondition[] = [{ field: 'role', operator: '=', value: role }];
    if (organizationId) {
      filters.push({ field: 'organization_id', operator: '=', value: organizationId });
    }
    return this.findAll({ ...options, filters: [...(options.filters || []), ...filters] });
  }

  async updateLastLogin(id: number): Promise<UserRow> {
    return this.update(id, { last_login_at: new Date().toISOString() } as any);
  }

  async getOrganizationMembers(organizationId: number, options: QueryOptions = {}): Promise<UserRow[]> {
    return this.findByOrganization(organizationId, {
      ...options,
      sort: options.sort || [{ field: 'created_at', direction: 'DESC' }]
    });
  }

  async getAdmins(organizationId: number): Promise<UserRow[]> {
    return this.findByRole('admin', organizationId);
  }
}

export class SourcesRepository extends BaseCRUD<SourceRow, CreateSourceInput, UpdateSourceInput> {
  constructor() {
    super('sources');
  }

  async findByUuid(uuid: string): Promise<SourceRow | null> {
    return this.findOne([{ field: 'uuid', operator: '=', value: uuid }]);
  }

  async findByOrganization(organizationId: number, options: QueryOptions = {}): Promise<SourceRow[]> {
    const filters: FilterCondition[] = [
      { field: 'organization_id', operator: '=', value: organizationId }
    ];
    return this.findAll({ ...options, filters: [...(options.filters || []), ...filters] });
  }

  async findByType(type: SourceType, organizationId?: number, options: QueryOptions = {}): Promise<SourceRow[]> {
    const filters: FilterCondition[] = [{ field: 'type', operator: '=', value: type }];
    if (organizationId) {
      filters.push({ field: 'organization_id', operator: '=', value: organizationId });
    }
    return this.findAll({ ...options, filters: [...(options.filters || []), ...filters] });
  }

  async findActive(organizationId?: number, options: QueryOptions = {}): Promise<SourceRow[]> {
    const filters: FilterCondition[] = [{ field: 'is_active', operator: '=', value: true }];
    if (organizationId) {
      filters.push({ field: 'organization_id', operator: '=', value: organizationId });
    }
    return this.findAll({ ...options, filters: [...(options.filters || []), ...filters] });
  }

  async updateSyncStatus(id: number, status: 'pending' | 'syncing' | 'completed' | 'failed', error?: string): Promise<SourceRow> {
    const updateData: any = {
      sync_status: status,
      last_synced_at: new Date().toISOString()
    };
    if (error !== undefined) {
      updateData.sync_error = error;
    }
    return this.update(id, updateData);
  }

  async toggleActive(id: number): Promise<SourceRow> {
    const source = await this.findById(id);
    if (!source) {
      throw new Error(`Source with id ${id} not found`);
    }
    return this.update(id, { is_active: !source.is_active } as any);
  }
}

export class ProjectsRepository extends BaseCRUD<ProjectRow, CreateProjectInput, UpdateProjectInput> {
  constructor() {
    super('projects');
  }

  async findByUuid(uuid: string): Promise<ProjectRow | null> {
    return this.findOne([{ field: 'uuid', operator: '=', value: uuid }]);
  }

  async findByOrganization(organizationId: number, options: QueryOptions = {}): Promise<ProjectRow[]> {
    const filters: FilterCondition[] = [
      { field: 'organization_id', operator: '=', value: organizationId }
    ];
    return this.findAll({ ...options, filters: [...(options.filters || []), ...filters] });
  }

  async findBySource(sourceId: number, options: QueryOptions = {}): Promise<ProjectRow[]> {
    const filters: FilterCondition[] = [
      { field: 'source_id', operator: '=', value: sourceId }
    ];
    return this.findAll({ ...options, filters: [...(options.filters || []), ...filters] });
  }

  async findByName(name: string, organizationId: number): Promise<ProjectRow | null> {
    const filters: FilterCondition[] = [
      { field: 'name', operator: '=', value: name },
      { field: 'organization_id', operator: '=', value: organizationId }
    ];
    return this.findOne(filters);
  }

  async findActive(organizationId?: number, options: QueryOptions = {}): Promise<ProjectRow[]> {
    const filters: FilterCondition[] = [{ field: 'is_active', operator: '=', value: true }];
    if (organizationId) {
      filters.push({ field: 'organization_id', operator: '=', value: organizationId });
    }
    return this.findAll({ ...options, filters: [...(options.filters || []), ...filters] });
  }

  async updateIndexingStatus(id: number, status: 'pending' | 'indexing' | 'completed' | 'failed', error?: string): Promise<ProjectRow> {
    const updateData: any = {
      indexing_status: status,
      last_indexed_at: new Date().toISOString()
    };
    if (error !== undefined) {
      updateData.indexing_error = error;
    }
    return this.update(id, updateData);
  }

  async toggleActive(id: number): Promise<ProjectRow> {
    const project = await this.findById(id);
    if (!project) {
      throw new Error(`Project with id ${id} not found`);
    }
    return this.update(id, { is_active: !project.is_active } as any);
  }

  async searchByName(searchTerm: string, organizationId: number, options: QueryOptions = {}): Promise<ProjectRow[]> {
    const filters: FilterCondition[] = [
      { field: 'name', operator: 'ILIKE', value: `%${searchTerm}%` },
      { field: 'organization_id', operator: '=', value: organizationId }
    ];
    return this.findAll({ ...options, filters: [...(options.filters || []), ...filters] });
  }

  async getProjectStats(organizationId: number): Promise<{
    total: number;
    active: number;
    indexing: number;
    failed: number;
  }> {
    const result = await this.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active,
        COUNT(CASE WHEN indexing_status = 'indexing' THEN 1 END) as indexing,
        COUNT(CASE WHEN indexing_status = 'failed' THEN 1 END) as failed
      FROM projects 
      WHERE organization_id = $1 AND deleted_at IS NULL
    `, [organizationId]);

    const row = result.rows[0];
    return {
      total: parseInt(row.total, 10),
      active: parseInt(row.active, 10),
      indexing: parseInt(row.indexing, 10),
      failed: parseInt(row.failed, 10)
    };
  }
}

// Export repository instances
export const organizationsRepo = new OrganizationsRepository();
export const usersRepo = new UsersRepository();
export const sourcesRepo = new SourcesRepository();
export const projectsRepo = new ProjectsRepository();
