-- =========================================================================
-- Migration: Log agent session history on every status change
-- =========================================================================

set search_path to public;

-- Extend history table to mirror agent_sessions snapshots
alter table agent_sessions_history
  add column if not exists status text,
  add column if not exists session_created_at timestamptz,
  add column if not exists session_updated_at timestamptz,
  add column if not exists session_closed_at timestamptz,
  add column if not exists last_connected_at timestamptz,
  add column if not exists token_metrics jsonb,
  add column if not exists runtime_stats jsonb,
  add column if not exists metrics_recorded_at timestamptz,
  add column if not exists metrics jsonb,
  add column if not exists session_snapshot jsonb;

comment on column agent_sessions_history.status is 'Session status at time of history entry (mirrors agent_sessions.status).';
comment on column agent_sessions_history.session_created_at is 'Original created_at timestamp from agent_sessions when this history record was captured.';
comment on column agent_sessions_history.session_updated_at is 'agent_sessions.updated_at value when this history record was captured.';
comment on column agent_sessions_history.session_closed_at is 'agent_sessions.closed_at value when this history record was captured.';
comment on column agent_sessions_history.last_connected_at is 'agent_sessions.last_connected_at value when this history record was captured.';
comment on column agent_sessions_history.token_metrics is 'Snapshot of agent_sessions.token_metrics JSON payload at time of entry.';
comment on column agent_sessions_history.runtime_stats is 'Snapshot of agent_sessions.runtime_stats JSON payload at time of entry.';
comment on column agent_sessions_history.metrics_recorded_at is 'Timestamp from agent_sessions.metrics_recorded_at when this history entry was created.';
comment on column agent_sessions_history.metrics is 'Snapshot of agent_sessions.metrics JSON payload at time of entry.';
comment on column agent_sessions_history.session_snapshot is 'Full JSON snapshot of the agent_sessions row when this history entry was recorded.';

drop function if exists log_agent_session_history(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  jsonb,
  text
);

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
  p_metadata jsonb default null,
  p_transport text default null
)
returns uuid
language plpgsql
as $$
declare
  v_history_id uuid;
  v_snapshot jsonb;
  v_status text;
  v_transport text;
  v_model text;
  v_connection_count integer;
  v_last_connected_at timestamptz;
  v_token_metrics jsonb;
  v_runtime_stats jsonb;
  v_metrics_recorded_at timestamptz;
  v_metrics jsonb;
  v_session_created_at timestamptz;
  v_session_updated_at timestamptz;
  v_session_closed_at timestamptz;
  v_provider_session_id text;
begin
  select to_jsonb(s)
  into v_snapshot
  from agent_sessions s
  where s.id = p_agent_session_id;

  v_status := coalesce(v_snapshot->>'status', p_new_status);
  v_transport := coalesce(
    p_transport,
    v_snapshot->>'transport',
    case p_agent_type
      when 'transcript' then 'realtime'
      when 'cards' then 'stateless'
      when 'facts' then 'stateless'
      else 'stateless'
    end
  );
  v_model := v_snapshot->>'model';
  v_connection_count := coalesce(
    p_connection_count,
    nullif(v_snapshot->>'connection_count', '')::integer
  );
  v_last_connected_at := (v_snapshot->>'last_connected_at')::timestamptz;
  v_token_metrics := v_snapshot->'token_metrics';
  v_runtime_stats := v_snapshot->'runtime_stats';
  v_metrics_recorded_at := (v_snapshot->>'metrics_recorded_at')::timestamptz;
  v_metrics := v_snapshot->'metrics';
  v_session_created_at := (v_snapshot->>'created_at')::timestamptz;
  v_session_updated_at := (v_snapshot->>'updated_at')::timestamptz;
  v_session_closed_at := (v_snapshot->>'closed_at')::timestamptz;
  v_provider_session_id := coalesce(
    p_provider_session_id,
    v_snapshot->>'provider_session_id'
  );

  insert into agent_sessions_history (
    agent_session_id,
    event_id,
    agent_id,
    agent_type,
    event_type,
    provider_session_id,
    previous_status,
    new_status,
    status,
    transport,
    model,
    connection_count,
    last_connected_at,
    token_metrics,
    runtime_stats,
    metrics_recorded_at,
    metrics,
    error_message,
    metadata,
    session_created_at,
    session_updated_at,
    session_closed_at,
    session_snapshot
  ) values (
    p_agent_session_id,
    p_event_id,
    p_agent_id,
    p_agent_type,
    p_event_type,
    v_provider_session_id,
    p_previous_status,
    p_new_status,
    v_status,
    v_transport,
    v_model,
    v_connection_count,
    v_last_connected_at,
    v_token_metrics,
    v_runtime_stats,
    v_metrics_recorded_at,
    v_metrics,
    p_error_message,
    p_metadata,
    v_session_created_at,
    v_session_updated_at,
    v_session_closed_at,
    v_snapshot
  )
  returning id into v_history_id;

  return v_history_id;
end;
$$;

comment on function log_agent_session_history is 'Helper function to log connection events to agent_sessions_history table (captures full agent_sessions snapshot).';

-- Trigger function to capture status transitions
create or replace function log_agent_session_status_change()
returns trigger
language plpgsql
as $$
declare
  v_event_type text;
begin
  if new.status is distinct from old.status then
    v_event_type := case
      when new.status = 'active' and old.status = 'paused' then 'resumed'
      when new.status = 'active' then 'connected'
      when new.status = 'paused' then 'paused'
      when new.status = 'error' then 'error'
      when new.status = 'closed' then 'closed'
      when new.status = 'starting' then 'disconnected'
      else null
    end;

    if v_event_type is not null then
      perform log_agent_session_history(
        new.id,
        new.event_id,
        new.agent_id,
        new.agent_type,
        v_event_type,
        new.provider_session_id,
        old.status,
        new.status,
        new.connection_count,
        null,
        jsonb_build_object(
          'source', 'trigger:agent_sessions_status_change',
          'previous_status', old.status,
          'new_status', new.status
        ),
        new.transport
      );
    end if;
  end if;

  return new;
end;
$$;

-- Ensure a single trigger definition
set check_function_bodies = off;

drop trigger if exists agent_sessions_status_history on agent_sessions;

create trigger agent_sessions_status_history
after update of status on agent_sessions
for each row
when (new.status is distinct from old.status)
execute function log_agent_session_status_change();
