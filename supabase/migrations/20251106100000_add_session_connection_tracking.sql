-- Migration: Add connection tracking fields to agent_sessions and create history table
-- Purpose: Track reconnection attempts and maintain audit trail of connection events

-- ============================================================================
-- 1. ADD CONNECTION TRACKING FIELDS TO AGENT_SESSIONS
-- ============================================================================

-- Add connection_count to track number of times this session has connected
alter table agent_sessions
  add column if not exists connection_count integer not null default 0;

-- Add last_connected_at to track when the current connection was established
alter table agent_sessions
  add column if not exists last_connected_at timestamptz;

-- Index for querying sessions by connection count (useful for debugging reconnection issues)
create index if not exists idx_agent_sessions_connection_count
  on agent_sessions(event_id, connection_count desc);

-- Index for querying sessions by last connection time
create index if not exists idx_agent_sessions_last_connected
  on agent_sessions(event_id, last_connected_at desc nulls last);

-- Comments
comment on column agent_sessions.connection_count is 'Number of times this session has been connected (incremented on each connect/resume)';
comment on column agent_sessions.last_connected_at is 'Timestamp when the current connection was established (updated on each connect/resume)';

-- ============================================================================
-- 2. CREATE AGENT_SESSIONS_HISTORY TABLE
-- ============================================================================
-- Audit trail for connection events (connect, disconnect, pause, resume, error)
-- Useful for debugging and analyzing connection patterns

create table if not exists agent_sessions_history (
  id uuid primary key default gen_random_uuid(),
  agent_session_id uuid not null references agent_sessions(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  agent_type text not null check (agent_type in ('cards', 'facts')),
  event_type text not null check (event_type in ('connected', 'disconnected', 'paused', 'resumed', 'error', 'closed')),
  provider_session_id text, -- OpenAI Realtime API session ID at time of event
  previous_status text, -- Status before this event
  new_status text, -- Status after this event
  connection_count integer, -- Connection count at time of event
  error_message text, -- Error message if event_type is 'error'
  metadata jsonb, -- Additional context (e.g., websocket state, queue length, etc.)
  created_at timestamptz default now()
);

-- Index for querying history by session
create index if not exists idx_agent_sessions_history_session
  on agent_sessions_history(agent_session_id, created_at desc);

-- Index for querying history by event
create index if not exists idx_agent_sessions_history_event
  on agent_sessions_history(event_id, agent_type, created_at desc);

-- Index for querying history by event type (useful for debugging)
create index if not exists idx_agent_sessions_history_event_type
  on agent_sessions_history(event_type, created_at desc);

-- Index for querying recent history
create index if not exists idx_agent_sessions_history_created
  on agent_sessions_history(created_at desc);

-- Comments
comment on table agent_sessions_history is 'Audit trail of connection events for agent sessions (connect, disconnect, pause, resume, error, closed)';
comment on column agent_sessions_history.event_type is 'Type of event: connected (new connection established), disconnected (connection lost), paused (intentionally paused), resumed (resumed from pause), error (connection error), closed (permanently closed)';
comment on column agent_sessions_history.provider_session_id is 'OpenAI Realtime API session ID at the time of this event';
comment on column agent_sessions_history.metadata is 'Additional context about the event (e.g., websocket state, queue length, error details)';

-- ============================================================================
-- 3. HELPER FUNCTION TO LOG HISTORY
-- ============================================================================
-- Function to insert history records (can be called from application code)

create or replace function log_agent_session_history(
  p_agent_session_id uuid,
  p_event_id uuid,
  p_agent_id uuid,
  p_agent_type text,
  p_event_type text,
  p_provider_session_id text default null,
  p_previous_status text default null,
  p_new_status text default null,
  p_connection_count integer default null,
  p_error_message text default null,
  p_metadata jsonb default null
)
returns uuid
language plpgsql
as $$
declare
  v_history_id uuid;
begin
  insert into agent_sessions_history (
    agent_session_id,
    event_id,
    agent_id,
    agent_type,
    event_type,
    provider_session_id,
    previous_status,
    new_status,
    connection_count,
    error_message,
    metadata
  ) values (
    p_agent_session_id,
    p_event_id,
    p_agent_id,
    p_agent_type,
    p_event_type,
    p_provider_session_id,
    p_previous_status,
    p_new_status,
    p_connection_count,
    p_error_message,
    p_metadata
  )
  returning id into v_history_id;
  
  return v_history_id;
end;
$$;

comment on function log_agent_session_history is 'Helper function to log connection events to agent_sessions_history table';

