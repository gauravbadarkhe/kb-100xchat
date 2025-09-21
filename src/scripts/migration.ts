import "dotenv/config";

import type { PoolClient } from "pg";
import { pool, withTx } from "../repo/pg";

const SQL = `
create extension if not exists vector;
create extension if not exists pg_trgm;

create table if not exists documents (
  id          bigserial primary key,
  repo_full   text not null,
  commit_sha  text not null,
  path        text not null,
  lang        text,
  sha         text not null,
  created_at  timestamptz default now(),
  unique (repo_full, commit_sha, path)
);

create table if not exists chunks (
  id            bigserial primary key,
  document_id   bigint not null references documents(id) on delete cascade,
  ordinal       int not null,
  text          text not null,
  meta          jsonb not null,
  hash          text not null,
  embedding     vector(1536)
);

create index if not exists idx_chunks_doc on chunks(document_id);
create index if not exists idx_chunks_meta_gin on chunks using gin (meta);
create index if not exists idx_chunks_trgm on chunks using gin (text gin_trgm_ops);

do $$ begin
  perform 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_chunks_vec';
  if not found then
    execute 'create index idx_chunks_vec on chunks using ivfflat (embedding vector_cosine_ops) with (lists=100)';
  end if;
end $$;

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  repo_filter jsonb not null default '{"mode":"all"}',
  created_at timestamptz default now()
);

create table if not exists messages (
  id bigserial primary key,
  session_id uuid not null references sessions(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  citations jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_messages_session on messages(session_id, id);



----Speed Boost-----------------

-- cosine similarity
create index if not exists idx_chunks_vec_hnsw
on chunks using hnsw (embedding vector_cosine_ops)
with (m=16, ef_construction=200);

-- runtime knob
set hnsw.ef_search = 64; -- try 32–128

create index if not exists idx_chunks_trgm on chunks using gin (text gin_trgm_ops);



-- alter
-- add blob_sha; keep commit_sha as commit-only
alter table documents add column if not exists blob_sha text;




-- SYMBOLS: top-level functions/classes/interfaces/etc.
create table if not exists symbols (
  id           bigserial primary key,
  document_id  bigint not null references documents(id) on delete cascade,
  language     text not null,
  kind         text not null,            -- function | method | class | interface | type | enum
  name         text not null,            -- fully-qualified when available
  signature    text,
  start_line   int,
  end_line     int,
  modifiers    jsonb default '{}'::jsonb,
  meta         jsonb default '{}'::jsonb
);
create index if not exists ix_symbols_doc       on symbols(document_id);
create index if not exists ix_symbols_name      on symbols(name);
create index if not exists ix_symbols_kind_name on symbols(kind, name);

-- ENDPOINTS: generic HTTP/RPC route handlers (Nest, FastAPI, Spring, etc.)
create table if not exists endpoints (
  id             bigserial primary key,
  document_id    bigint not null references documents(id) on delete cascade,
  language       text not null,
  protocol       text not null default 'http',  -- http|grpc|cli|rpc
  method         text,                          -- GET/POST/...
  path           text,                          -- /v1/orders
  operation_id   text,
  handler_name   text,                          -- Controller.method or equivalent
  start_line     int,
  end_line       int,
  decorators     jsonb default '[]'::jsonb,
  request_shape  jsonb,
  response_shape jsonb,
  meta           jsonb default '{}'::jsonb
);
create index if not exists ix_endpoints_path on endpoints(path);
create index if not exists ix_endpoints_proto_method_path on endpoints(protocol, method, path);

-- EDGES: generic relationships (pubsub publish/consume, http calls, db calls)
create table if not exists edges (
  id                bigserial primary key,
  from_document_id  bigint not null references documents(id) on delete cascade,
  from_symbol_name  text,
  edge_type         text not null,              -- pubsub.publish | pubsub.consume | http.call | db.call | emits | reads
  to_kind           text not null,              -- topic | url | orm | queue | stream
  to_value          text not null,              -- topic name, URL/path, orm method, etc.
  start_line        int,
  end_line          int,
  meta              jsonb default '{}'::jsonb
);
create index if not exists ix_edges_type_kind_value on edges(edge_type, to_kind, to_value);
create index if not exists ix_edges_from_doc         on edges(from_document_id);

-- FINDINGS: lints/security scanners (eslint/semgrep/codeql)
create table if not exists findings (
  id           bigserial primary key,
  document_id  bigint references documents(id) on delete cascade,
  tool         text not null,
  rule_id      text not null,
  severity     text not null,                  -- info|warn|error|high|critical
  message      text not null,
  start_line   int,
  end_line     int,
  fingerprint  text,
  meta         jsonb default '{}'::jsonb,
  created_at   timestamptz default now()
);
create index if not exists ix_findings_doc on findings(document_id);
create index if not exists ix_findings_sev on findings(severity);

`;

async function main() {
  try {
    console.log("Running Migrations");

    await withTx(async (c: PoolClient) => {
      await c.query(SQL);
    });

    console.log("Migrations Successful");
  } catch (err) {
    console.error("Error Running Migrations", err);
  }
}
main();
