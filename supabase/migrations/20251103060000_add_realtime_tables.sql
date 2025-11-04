-- Migration: Add tables and columns for real-time event processing with OpenAI Realtime API
-- Generated: 2024-11-03
-- Purpose: Support dual-agent architecture (Cards + Facts) with session management, checkpoints, and facts tracking

-- ============================================================================
-- 1. ENHANCE TRANSCRIPTS TABLE
-- ============================================================================
-- Add sequence number, millisecond timestamp, speaker, and final flag
-- These fields enable ordered processing and tracking of partial vs. finalized transcripts

alter table transcripts
  add column if not exists seq bigint,
  add column if not exists at_ms bigint,
  add column if not exists speaker text,
  add column if not exists final boolean default true;

-- Create index on (event_id, seq) for efficient ordered retrieval
create index if not exists idx_transcripts_event_seq
  on transcripts(event_id, seq);

-- Create index on (event_id, final) for filtering finalized transcripts
create index if not exists idx_transcripts_event_final
  on transcripts(event_id, final)
  where final = true;

-- ============================================================================
-- 2. AGENT_SESSIONS TABLE
-- ============================================================================
-- Tracks OpenAI Realtime API sessions per agent
-- Each event has two agents (Cards + Facts), each with their own session

create table if not exists agent_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  provider_session_id text not null, -- OpenAI Realtime API session ID
  agent_type text not null check (agent_type in ('cards', 'facts')),
  status text not null check (status in ('starting', 'active', 'closed', 'error')) default 'starting',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  closed_at timestamptz,
  unique(event_id, agent_type) -- One session per agent type per event
);

-- Index for fast lookup by event and agent type
create index if not exists idx_agent_sessions_event_type
  on agent_sessions(event_id, agent_type);

-- Index for active sessions
create index if not exists idx_agent_sessions_status
  on agent_sessions(status)
  where status = 'active';

-- ============================================================================
-- 3. CHECKPOINTS TABLE
-- ============================================================================
-- Tracks processing progress per agent for resume capability
-- When orchestrator restarts, it reads checkpoints and replays missing transcripts

create table if not exists checkpoints (
  event_id uuid not null references events(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  agent_type text not null check (agent_type in ('cards', 'facts')),
  last_seq_processed bigint not null default 0,
  updated_at timestamptz default now(),
  primary key (event_id, agent_type) -- One checkpoint per agent type per event
);

-- Index for fast checkpoint retrieval
create index if not exists idx_checkpoints_event_agent
  on checkpoints(event_id, agent_type);

-- ============================================================================
-- 4. AGENT_OUTPUTS TABLE
-- ============================================================================
-- Stores structured outputs from both agents (cards and facts updates)
-- Separates agent outputs from the legacy cards table for better organization

create table if not exists agent_outputs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  agent_type text not null check (agent_type in ('cards', 'facts')),
  for_seq bigint, -- Sequence number of transcript that triggered this output
  type text not null, -- 'card', 'fact_update', 'fact_delete', etc.
  payload jsonb not null, -- Structured output data
  created_at timestamptz default now()
);

-- Index for efficient retrieval by event and agent type
create index if not exists idx_agent_outputs_event_type
  on agent_outputs(event_id, agent_type);

-- Index for chronological ordering
create index if not exists idx_agent_outputs_event_created
  on agent_outputs(event_id, created_at);

-- Index for sequence-based queries
create index if not exists idx_agent_outputs_event_seq
  on agent_outputs(event_id, for_seq)
  where for_seq is not null;

-- ============================================================================
-- 5. FACTS TABLE
-- ============================================================================
-- Key-value store for stable facts extracted during events
-- Facts are updated periodically (every 20-30s) or on triggers
-- Confidence scores and source tracking enable fact validation

create table if not exists facts (
  event_id uuid not null references events(id) on delete cascade,
  fact_key text not null, -- e.g., 'agenda', 'decision', 'deadline', 'metric'
  fact_value jsonb not null, -- Flexible value structure
  confidence float not null default 0.5 check (confidence >= 0 and confidence <= 1),
  last_seen_seq bigint not null default 0, -- Last transcript sequence where this fact was seen
  sources int[] default array[]::int[], -- Array of transcript IDs that contributed to this fact
  updated_at timestamptz default now(),
  created_at timestamptz default now(),
  primary key (event_id, fact_key)
);

-- Index for fast fact lookup by event
create index if not exists idx_facts_event
  on facts(event_id);

-- Index for confidence-based queries
create index if not exists idx_facts_confidence
  on facts(event_id, confidence desc);

-- Index for sequence-based queries (find facts updated after a sequence)
create index if not exists idx_facts_last_seen_seq
  on facts(event_id, last_seen_seq);

-- ============================================================================
-- 6. HELPER FUNCTIONS
-- ============================================================================

-- Function to update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger to auto-update updated_at on agent_sessions
create trigger update_agent_sessions_updated_at
  before update on agent_sessions
  for each row
  execute function update_updated_at_column();

-- Trigger to auto-update updated_at on checkpoints
create trigger update_checkpoints_updated_at
  before update on checkpoints
  for each row
  execute function update_updated_at_column();

-- Trigger to auto-update updated_at on facts
create trigger update_facts_updated_at
  before update on facts
  for each row
  execute function update_updated_at_column();

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

comment on table agent_sessions is 'Tracks OpenAI Realtime API sessions for Cards and Facts agents per event';
comment on table checkpoints is 'Tracks processing progress per agent for resume capability after restart';
comment on table agent_outputs is 'Stores structured outputs from Cards and Facts agents (cards, fact updates, etc.)';
comment on table facts is 'Key-value store for stable facts extracted during events (agenda, decisions, deadlines, metrics)';

comment on column transcripts.seq is 'Sequence number for ordered processing (increments per event)';
comment on column transcripts.at_ms is 'Timestamp in milliseconds since epoch for precise ordering';
comment on column transcripts.speaker is 'Optional speaker identifier (e.g., "speaker_1", "user_123")';
comment on column transcripts.final is 'Whether this transcript chunk is finalized (false for partial/interim transcripts)';

comment on column agent_sessions.provider_session_id is 'OpenAI Realtime API session ID (returned when creating session)';
comment on column agent_sessions.agent_type is 'Type of agent: "cards" or "facts"';

comment on column checkpoints.last_seq_processed is 'Last transcript sequence number processed by this agent';
comment on column checkpoints.agent_type is 'Type of agent: "cards" or "facts"';

comment on column agent_outputs.for_seq is 'Sequence number of transcript that triggered this output (nullable for facts updates)';
comment on column agent_outputs.type is 'Output type: "card", "fact_update", "fact_delete", etc.';

comment on column facts.fact_key is 'Stable key identifier (e.g., "agenda", "decision_1", "deadline_2025-01-15")';
comment on column facts.fact_value is 'Flexible JSON value structure (can store strings, objects, arrays, etc.)';
comment on column facts.confidence is 'Confidence score 0-1 indicating how certain this fact is';
comment on column facts.last_seen_seq is 'Last transcript sequence where this fact was observed/updated';
comment on column facts.sources is 'Array of transcript IDs that contributed evidence for this fact';

