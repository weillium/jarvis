-- Enable pgvector
create extension if not exists vector;

-- USERS and AUTH handled automatically by Supabase

-- EVENTS TABLE
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  owner_uid uuid not null,
  title text not null,
  topic text,
  start_time timestamptz,
  end_time timestamptz,
  created_at timestamptz default now()
);

-- EVENT DOCS
create table if not exists event_docs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  path text not null,
  created_at timestamptz default now()
);

-- AGENTS
create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  status text check (status in ('prepping','ready','running','ended','error')) default 'prepping',
  model text default 'gpt-4o-mini',
  created_at timestamptz default now()
);

-- CONTEXT ITEMS (Vector DB)
create table if not exists context_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  source text,
  chunk text not null,
  embedding vector(1536)
);

-- TRANSCRIPTS
create table if not exists transcripts (
  id bigserial primary key,
  event_id uuid references events(id) on delete cascade,
  ts timestamptz default now(),
  text text not null
);

-- CARDS
create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  emitted_at timestamptz default now(),
  kind text,
  payload jsonb
);

-- ATTENDEES
create table if not exists attendees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  user_email text,
  joined_at timestamptz default now()
);