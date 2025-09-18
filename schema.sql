-- schema.sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS documents (
  id            BIGSERIAL PRIMARY KEY,
  repo_full     TEXT NOT NULL,
  commit_sha    TEXT NOT NULL,
  path          TEXT NOT NULL,
  lang          TEXT,
  sha           TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (repo_full, commit_sha, path)
);

CREATE TABLE IF NOT EXISTS chunks (
  id            BIGSERIAL PRIMARY KEY,
  document_id   BIGINT REFERENCES documents(id) ON DELETE CASCADE,
  ordinal       INT NOT NULL,
  text          TEXT NOT NULL,
  meta          JSONB NOT NULL,
  hash          TEXT NOT NULL,
  embedding     vector(1536)  -- text-embedding-3-small
);

CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_gin ON chunks USING GIN (meta);
CREATE INDEX IF NOT EXISTS idx_chunks_vec ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists=100);

-- run once
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- trigram index on chunk text
CREATE INDEX IF NOT EXISTS idx_chunks_trgm ON chunks USING gin (text gin_trgm_ops);

