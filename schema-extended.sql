-- Extended schema for multi-tenant knowledge base
-- This extends the existing schema.sql with user management, organizations, projects, and sources

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id                BIGSERIAL PRIMARY KEY,
  uuid              UUID UNIQUE NOT NULL DEFAULT uuid_generate_v4(),
  name              TEXT NOT NULL,
  description       TEXT,
  settings          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS users (
  id                BIGSERIAL PRIMARY KEY,
  auth_id           UUID UNIQUE NOT NULL, -- References auth.users.id in Supabase
  organization_id   BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email             TEXT NOT NULL,
  full_name         TEXT,
  role              TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),
  settings          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  last_login_at     TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ,
  UNIQUE(auth_id, organization_id)
);

-- Source types enum for different integration types
CREATE TYPE source_type AS ENUM (
  'github', 
  'bitbucket', 
  'gitlab', 
  'documentation', 
  'confluence', 
  'notion', 
  'file_upload',
  'other'
);

-- Sources table for external integrations
CREATE TABLE IF NOT EXISTS sources (
  id                BIGSERIAL PRIMARY KEY,
  uuid              UUID UNIQUE NOT NULL DEFAULT uuid_generate_v4(),
  organization_id   BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by        BIGINT NOT NULL REFERENCES users(id),
  name              TEXT NOT NULL,
  description       TEXT,
  type              source_type NOT NULL,
  config            JSONB NOT NULL DEFAULT '{}', -- Integration-specific config (tokens, URLs, etc.)
  is_active         BOOLEAN NOT NULL DEFAULT true,
  last_synced_at    TIMESTAMPTZ,
  sync_status       TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'syncing', 'completed', 'failed')),
  sync_error        TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

-- Projects table - containers for indexed knowledge
CREATE TABLE IF NOT EXISTS projects (
  id                BIGSERIAL PRIMARY KEY,
  uuid              UUID UNIQUE NOT NULL DEFAULT uuid_generate_v4(),
  organization_id   BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_id         BIGINT REFERENCES sources(id) ON DELETE SET NULL,
  created_by        BIGINT NOT NULL REFERENCES users(id),
  name              TEXT NOT NULL,
  description       TEXT,
  settings          JSONB NOT NULL DEFAULT '{}', -- Project-specific settings (ignored files, branches, etc.)
  is_active         BOOLEAN NOT NULL DEFAULT true,
  last_indexed_at   TIMESTAMPTZ,
  indexing_status   TEXT DEFAULT 'pending' CHECK (indexing_status IN ('pending', 'indexing', 'completed', 'failed')),
  indexing_error    TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  deleted_at        TIMESTAMPTZ,
  UNIQUE(organization_id, name)
);

-- Update existing documents table to link to projects
-- First, add the new column
ALTER TABLE documents ADD COLUMN IF NOT EXISTS project_id BIGINT REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_organizations_uuid ON organizations(uuid);
CREATE INDEX IF NOT EXISTS idx_organizations_deleted_at ON organizations(deleted_at);

CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);

CREATE INDEX IF NOT EXISTS idx_sources_organization_id ON sources(organization_id);
CREATE INDEX IF NOT EXISTS idx_sources_type ON sources(type);
CREATE INDEX IF NOT EXISTS idx_sources_is_active ON sources(is_active);
CREATE INDEX IF NOT EXISTS idx_sources_deleted_at ON sources(deleted_at);

CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_projects_source_id ON projects(source_id);
CREATE INDEX IF NOT EXISTS idx_projects_is_active ON projects(is_active);
CREATE INDEX IF NOT EXISTS idx_projects_deleted_at ON projects(deleted_at);

CREATE INDEX IF NOT EXISTS idx_documents_project_id ON documents(project_id);
CREATE INDEX IF NOT EXISTS idx_documents_created_by ON documents(created_by);

-- Update the existing unique constraint on documents to include project_id
-- First drop the old constraint, then add the new one
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_repo_full_commit_sha_path_key;
ALTER TABLE documents ADD CONSTRAINT documents_project_repo_commit_path_unique 
  UNIQUE (project_id, repo_full, commit_sha, path);

-- Functions for updated_at timestamps
-- Note: Triggers temporarily disabled for initial migration
-- These can be added later if automatic updated_at timestamps are needed

-- CREATE OR REPLACE FUNCTION update_updated_at_column()
-- RETURNS TRIGGER AS $$
-- BEGIN
--     NEW.updated_at = now();
--     RETURN NEW;
-- END;
-- $$ language 'plpgsql';

-- Triggers for updated_at (commented out for now)
-- CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations 
--   FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users 
--   FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- CREATE TRIGGER update_sources_updated_at BEFORE UPDATE ON sources 
--   FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects 
--   FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents 
--   FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS (Row Level Security) policies for multi-tenancy
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;

-- RLS policies (to be implemented based on Supabase auth)
-- These will be created when we set up the Supabase integration

-- Sample data for development (optional)
-- INSERT INTO organizations (name, description) VALUES 
--   ('Default Organization', 'Default organization for initial setup')
-- ON CONFLICT DO NOTHING;
