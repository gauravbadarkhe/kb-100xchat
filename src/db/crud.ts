// src/db/crud.ts
// Common CRUD operations with proper error handling and type safety

import { db } from '../db';
import { QueryResult } from 'pg';

export type PaginationOptions = {
  page?: number;
  limit?: number;
  offset?: number;
};

export type SortOptions = {
  field: string;
  direction: 'ASC' | 'DESC';
};

export type FilterCondition = {
  field: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'ILIKE' | 'IN' | 'IS NULL' | 'IS NOT NULL';
  value?: any;
};

export type QueryOptions = {
  pagination?: PaginationOptions;
  sort?: SortOptions[];
  filters?: FilterCondition[];
  includeDeleted?: boolean;
};

export class DatabaseError extends Error {
  constructor(message: string, public code?: string, public detail?: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class NotFoundError extends DatabaseError {
  constructor(resource: string, identifier?: string | number) {
    super(`${resource} not found${identifier ? ` with identifier: ${identifier}` : ''}`);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends DatabaseError {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class BaseCRUD<T extends Record<string, any>, TCreate, TUpdate> {
  constructor(
    protected tableName: string,
    protected primaryKey: string = 'id'
  ) {}

  /**
   * Build WHERE clause from filters
   */
  private buildWhereClause(filters: FilterCondition[], includeDeleted: boolean = false): { clause: string; values: any[] } {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    // Add soft delete filter by default
    if (!includeDeleted) {
      conditions.push('deleted_at IS NULL');
    }

    for (const filter of filters) {
      const { field, operator, value } = filter;
      
      switch (operator) {
        case 'IS NULL':
        case 'IS NOT NULL':
          conditions.push(`${field} ${operator}`);
          break;
        case 'IN':
          if (Array.isArray(value) && value.length > 0) {
            const placeholders = value.map(() => `$${paramCount++}`).join(', ');
            conditions.push(`${field} IN (${placeholders})`);
            values.push(...value);
          }
          break;
        default:
          conditions.push(`${field} ${operator} $${paramCount++}`);
          values.push(value);
      }
    }

    const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { clause, values };
  }

  /**
   * Build ORDER BY clause from sort options
   */
  private buildOrderClause(sort: SortOptions[]): string {
    if (sort.length === 0) return '';
    const orderClauses = sort.map(s => `${s.field} ${s.direction}`);
    return `ORDER BY ${orderClauses.join(', ')}`;
  }

  /**
   * Build LIMIT and OFFSET clause from pagination
   */
  private buildPaginationClause(pagination: PaginationOptions, valueOffset: number): { clause: string; values: any[] } {
    const values: any[] = [];
    let clause = '';

    if (pagination.limit !== undefined) {
      clause += ` LIMIT $${valueOffset + 1}`;
      values.push(pagination.limit);
      valueOffset++;
    }

    if (pagination.offset !== undefined) {
      clause += ` OFFSET $${valueOffset + 1}`;
      values.push(pagination.offset);
    } else if (pagination.page !== undefined && pagination.limit !== undefined) {
      const offset = (pagination.page - 1) * pagination.limit;
      clause += ` OFFSET $${valueOffset + 1}`;
      values.push(offset);
    }

    return { clause, values };
  }

  /**
   * Find all records with optional filtering, sorting, and pagination
   */
  async findAll(options: QueryOptions = {}): Promise<T[]> {
    try {
      const { filters = [], sort = [], pagination = {}, includeDeleted = false } = options;
      
      const { clause: whereClause, values: whereValues } = this.buildWhereClause(filters, includeDeleted);
      const orderClause = this.buildOrderClause(sort);
      const { clause: paginationClause, values: paginationValues } = this.buildPaginationClause(pagination, whereValues.length);

      const query = `
        SELECT * FROM ${this.tableName}
        ${whereClause}
        ${orderClause}
        ${paginationClause}
      `;

      const result = await db.query(query, [...whereValues, ...paginationValues]);
      return result.rows as T[];
    } catch (error: any) {
      throw new DatabaseError(`Failed to find records from ${this.tableName}`, error.code, error.message);
    }
  }

  /**
   * Find a single record by ID
   */
  async findById(id: number | string, includeDeleted: boolean = false): Promise<T | null> {
    try {
      const filters: FilterCondition[] = [{ field: this.primaryKey, operator: '=', value: id }];
      const records = await this.findAll({ filters, includeDeleted });
      return records[0] || null;
    } catch (error: any) {
      throw new DatabaseError(`Failed to find record by ${this.primaryKey}`, error.code, error.message);
    }
  }

  /**
   * Find a single record by conditions
   */
  async findOne(filters: FilterCondition[], includeDeleted: boolean = false): Promise<T | null> {
    try {
      const records = await this.findAll({ filters, includeDeleted, pagination: { limit: 1 } });
      return records[0] || null;
    } catch (error: any) {
      throw new DatabaseError(`Failed to find single record from ${this.tableName}`, error.code, error.message);
    }
  }

  /**
   * Create a new record
   */
  async create(data: TCreate): Promise<T> {
    try {
      const fields = Object.keys(data as any);
      const values = Object.values(data as any);
      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

      const query = `
        INSERT INTO ${this.tableName} (${fields.join(', ')})
        VALUES (${placeholders})
        RETURNING *
      `;

      const result = await db.query(query, values);
      if (result.rows.length === 0) {
        throw new DatabaseError(`Failed to create record in ${this.tableName}`);
      }
      return result.rows[0] as T;
    } catch (error: any) {
      if (error.code === '23505') { // Unique violation
        throw new ValidationError(`Duplicate entry for ${this.tableName}`, error.constraint);
      }
      if (error.code === '23503') { // Foreign key violation
        throw new ValidationError(`Invalid reference in ${this.tableName}`, error.constraint);
      }
      if (error.code === '23514') { // Check constraint violation
        throw new ValidationError(`Invalid data for ${this.tableName}`, error.constraint);
      }
      throw new DatabaseError(`Failed to create record in ${this.tableName}`, error.code, error.message);
    }
  }

  /**
   * Update a record by ID
   */
  async update(id: number | string, data: TUpdate): Promise<T> {
    try {
      const fields = Object.keys(data as any);
      const values = Object.values(data as any);
      
      if (fields.length === 0) {
        throw new ValidationError('No fields to update');
      }

      const setClause = fields.map((field, i) => `${field} = $${i + 1}`).join(', ');
      values.push(id);

      const query = `
        UPDATE ${this.tableName}
        SET ${setClause}
        WHERE ${this.primaryKey} = $${values.length} AND deleted_at IS NULL
        RETURNING *
      `;

      const result = await db.query(query, values);
      if (result.rows.length === 0) {
        throw new NotFoundError(this.tableName, id);
      }
      return result.rows[0] as T;
    } catch (error: any) {
      if (error instanceof NotFoundError) throw error;
      if (error.code === '23505') { // Unique violation
        throw new ValidationError(`Duplicate entry for ${this.tableName}`, error.constraint);
      }
      if (error.code === '23503') { // Foreign key violation
        throw new ValidationError(`Invalid reference in ${this.tableName}`, error.constraint);
      }
      throw new DatabaseError(`Failed to update record in ${this.tableName}`, error.code, error.message);
    }
  }

  /**
   * Soft delete a record by ID
   */
  async softDelete(id: number | string): Promise<T> {
    try {
      const query = `
        UPDATE ${this.tableName}
        SET deleted_at = now()
        WHERE ${this.primaryKey} = $1 AND deleted_at IS NULL
        RETURNING *
      `;

      const result = await db.query(query, [id]);
      if (result.rows.length === 0) {
        throw new NotFoundError(this.tableName, id);
      }
      return result.rows[0] as T;
    } catch (error: any) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to soft delete record in ${this.tableName}`, error.code, error.message);
    }
  }

  /**
   * Hard delete a record by ID (permanent deletion)
   */
  async hardDelete(id: number | string): Promise<boolean> {
    try {
      const query = `DELETE FROM ${this.tableName} WHERE ${this.primaryKey} = $1`;
      const result = await db.query(query, [id]);
      return result.rowCount !== null && result.rowCount > 0;
    } catch (error: any) {
      throw new DatabaseError(`Failed to hard delete record in ${this.tableName}`, error.code, error.message);
    }
  }

  /**
   * Restore a soft-deleted record
   */
  async restore(id: number | string): Promise<T> {
    try {
      const query = `
        UPDATE ${this.tableName}
        SET deleted_at = NULL
        WHERE ${this.primaryKey} = $1 AND deleted_at IS NOT NULL
        RETURNING *
      `;

      const result = await db.query(query, [id]);
      if (result.rows.length === 0) {
        throw new NotFoundError(`Deleted ${this.tableName}`, id);
      }
      return result.rows[0] as T;
    } catch (error: any) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to restore record in ${this.tableName}`, error.code, error.message);
    }
  }

  /**
   * Count records with optional filters
   */
  async count(filters: FilterCondition[] = [], includeDeleted: boolean = false): Promise<number> {
    try {
      const { clause: whereClause, values } = this.buildWhereClause(filters, includeDeleted);
      
      const query = `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`;
      const result = await db.query(query, values);
      return parseInt(result.rows[0].count, 10);
    } catch (error: any) {
      throw new DatabaseError(`Failed to count records in ${this.tableName}`, error.code, error.message);
    }
  }

  /**
   * Check if a record exists
   */
  async exists(filters: FilterCondition[], includeDeleted: boolean = false): Promise<boolean> {
    try {
      const count = await this.count(filters, includeDeleted);
      return count > 0;
    } catch (error: any) {
      throw new DatabaseError(`Failed to check existence in ${this.tableName}`, error.code, error.message);
    }
  }

  /**
   * Execute a custom query with proper error handling
   */
  async query(sql: string, params: any[] = []): Promise<QueryResult> {
    try {
      return await db.query(sql, params);
    } catch (error: any) {
      throw new DatabaseError(`Custom query failed on ${this.tableName}`, error.code, error.message);
    }
  }
}

/**
 * Helper function to handle database transactions
 */
export async function withTransaction<T>(
  callback: (client: any) => Promise<T>
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
