-- =========================================================================
-- Migration: Fix log_agent_session_history to avoid rowtype field lookups
-- =========================================================================

set search_path to public;

-- Recreate helper using JSON snapshots so it works regardless of optional columns
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
  v_connection_count_text text;
begin
  select to_jsonb(s)
  into v_snapshot
  from agent_sessions s
  where s.id = p_agent_session_id;

  if v_snapshot is null then
    v_snapshot := '{}'::jsonb;
  end if;

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

  v_connection_count_text := v_snapshot->>'connection_count';
  v_connection_count := coalesce(
    p_connection_count,
    case when v_connection_count_text is not null and v_connection_count_text <> ''
      then v_connection_count_text::integer
      else null end
  );

  v_last_connected_at := nullif(v_snapshot->>'last_connected_at', '')::timestamptz;
  v_token_metrics := v_snapshot->'token_metrics';
  v_runtime_stats := v_snapshot->'runtime_stats';
  v_metrics_recorded_at := nullif(v_snapshot->>'metrics_recorded_at', '')::timestamptz;
  v_metrics := v_snapshot->'metrics';
  v_session_created_at := nullif(v_snapshot->>'created_at', '')::timestamptz;
  v_session_updated_at := nullif(v_snapshot->>'updated_at', '')::timestamptz;
  v_session_closed_at := nullif(v_snapshot->>'closed_at', '')::timestamptz;
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

comment on function log_agent_session_history is 'Helper function to log connection events to agent_sessions_history table (captures full agent_sessions snapshot without relying on rowtype fields).';
