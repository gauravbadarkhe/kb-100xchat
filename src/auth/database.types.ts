// src/auth/database.types.ts
// Database types for Supabase

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: number;
          uuid: string;
          name: string;
          description: string | null;
          settings: Json;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: number;
          uuid?: string;
          name: string;
          description?: string | null;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: number;
          uuid?: string;
          name?: string;
          description?: string | null;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      users: {
        Row: {
          id: number;
          auth_id: string;
          organization_id: number;
          email: string;
          full_name: string | null;
          role: 'admin' | 'member' | 'viewer';
          settings: Json;
          created_at: string;
          updated_at: string;
          last_login_at: string | null;
          deleted_at: string | null;
        };
        Insert: {
          id?: number;
          auth_id: string;
          organization_id: number;
          email: string;
          full_name?: string | null;
          role?: 'admin' | 'member' | 'viewer';
          settings?: Json;
          created_at?: string;
          updated_at?: string;
          last_login_at?: string | null;
          deleted_at?: string | null;
        };
        Update: {
          id?: number;
          auth_id?: string;
          organization_id?: number;
          email?: string;
          full_name?: string | null;
          role?: 'admin' | 'member' | 'viewer';
          settings?: Json;
          created_at?: string;
          updated_at?: string;
          last_login_at?: string | null;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'users_organization_id_fkey';
            columns: ['organization_id'];
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          }
        ];
      };
      sources: {
        Row: {
          id: number;
          uuid: string;
          organization_id: number;
          created_by: number;
          name: string;
          description: string | null;
          type: 'github' | 'bitbucket' | 'gitlab' | 'documentation' | 'confluence' | 'notion' | 'file_upload' | 'other';
          config: Json;
          is_active: boolean;
          last_synced_at: string | null;
          sync_status: 'pending' | 'syncing' | 'completed' | 'failed';
          sync_error: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: number;
          uuid?: string;
          organization_id: number;
          created_by: number;
          name: string;
          description?: string | null;
          type: 'github' | 'bitbucket' | 'gitlab' | 'documentation' | 'confluence' | 'notion' | 'file_upload' | 'other';
          config?: Json;
          is_active?: boolean;
          last_synced_at?: string | null;
          sync_status?: 'pending' | 'syncing' | 'completed' | 'failed';
          sync_error?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: number;
          uuid?: string;
          organization_id?: number;
          created_by?: number;
          name?: string;
          description?: string | null;
          type?: 'github' | 'bitbucket' | 'gitlab' | 'documentation' | 'confluence' | 'notion' | 'file_upload' | 'other';
          config?: Json;
          is_active?: boolean;
          last_synced_at?: string | null;
          sync_status?: 'pending' | 'syncing' | 'completed' | 'failed';
          sync_error?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'sources_organization_id_fkey';
            columns: ['organization_id'];
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sources_created_by_fkey';
            columns: ['created_by'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      projects: {
        Row: {
          id: number;
          uuid: string;
          organization_id: number;
          source_id: number | null;
          created_by: number;
          name: string;
          description: string | null;
          settings: Json;
          is_active: boolean;
          last_indexed_at: string | null;
          indexing_status: 'pending' | 'indexing' | 'completed' | 'failed';
          indexing_error: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: number;
          uuid?: string;
          organization_id: number;
          source_id?: number | null;
          created_by: number;
          name: string;
          description?: string | null;
          settings?: Json;
          is_active?: boolean;
          last_indexed_at?: string | null;
          indexing_status?: 'pending' | 'indexing' | 'completed' | 'failed';
          indexing_error?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: number;
          uuid?: string;
          organization_id?: number;
          source_id?: number | null;
          created_by?: number;
          name?: string;
          description?: string | null;
          settings?: Json;
          is_active?: boolean;
          last_indexed_at?: string | null;
          indexing_status?: 'pending' | 'indexing' | 'completed' | 'failed';
          indexing_error?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'projects_organization_id_fkey';
            columns: ['organization_id'];
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'projects_source_id_fkey';
            columns: ['source_id'];
            referencedRelation: 'sources';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'projects_created_by_fkey';
            columns: ['created_by'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      documents: {
        Row: {
          id: number;
          project_id: number | null;
          created_by: number | null;
          repo_full: string;
          commit_sha: string;
          path: string;
          lang: string | null;
          sha: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          project_id?: number | null;
          created_by?: number | null;
          repo_full: string;
          commit_sha: string;
          path: string;
          lang?: string | null;
          sha: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          project_id?: number | null;
          created_by?: number | null;
          repo_full?: string;
          commit_sha?: string;
          path?: string;
          lang?: string | null;
          sha?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'documents_project_id_fkey';
            columns: ['project_id'];
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'documents_created_by_fkey';
            columns: ['created_by'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      chunks: {
        Row: {
          id: number;
          document_id: number;
          ordinal: number;
          text: string;
          meta: Json;
          hash: string;
          embedding: string | null; // Vector type as string
        };
        Insert: {
          id?: number;
          document_id: number;
          ordinal: number;
          text: string;
          meta: Json;
          hash: string;
          embedding?: string | null;
        };
        Update: {
          id?: number;
          document_id?: number;
          ordinal?: number;
          text?: string;
          meta?: Json;
          hash?: string;
          embedding?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'chunks_document_id_fkey';
            columns: ['document_id'];
            referencedRelation: 'documents';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      source_type: 'github' | 'bitbucket' | 'gitlab' | 'documentation' | 'confluence' | 'notion' | 'file_upload' | 'other';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
