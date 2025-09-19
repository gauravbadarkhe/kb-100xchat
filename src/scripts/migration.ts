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
