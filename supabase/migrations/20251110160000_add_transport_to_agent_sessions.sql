-- Migration: add transport information to agent sessions
-- Ensures each session records whether it uses realtime or stateless transport

-- 1. agent_sessions table ---------------------------------------------------

alter table agent_sessions
  add column if not exists transport text;

update agent_sessions
set transport = case agent_type
  when 'transcript' then 'realtime'
  when 'cards' then 'stateless'
  when 'facts' then 'stateless'
  else 'stateless'
end
where transport is null;

alter table agent_sessions
  alter column transport set default 'stateless';

alter table agent_sessions
  alter column transport set not null;

alter table agent_sessions
  drop constraint if exists agent_sessions_transport_check;

alter table agent_sessions
  add constraint agent_sessions_transport_check
  check (transport in ('realtime', 'stateless'));

comment on column agent_sessions.transport is 'Transport mode used for the agent session: "realtime" or "stateless".';

-- 2. agent_sessions_history table -------------------------------------------

alter table agent_sessions_history
  add column if not exists transport text;

update agent_sessions_history
set transport = case agent_type
  when 'transcript' then 'realtime'
  when 'cards' then 'stateless'
  when 'facts' then 'stateless'
  else 'stateless'
end
where transport is null;

alter table agent_sessions_history
  alter column transport set default 'stateless';

alter table agent_sessions_history
  alter column transport set not null;

alter table agent_sessions_history
  drop constraint if exists agent_sessions_history_transport_check;

alter table agent_sessions_history
  add constraint agent_sessions_history_transport_check
  check (transport in ('realtime', 'stateless'));

comment on column agent_sessions_history.transport is 'Transport mode recorded for this session history entry.';

-- 3. helper function update -------------------------------------------------

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
  jsonb
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
  v_transport text;
begin
  v_transport := coalesce(
    p_transport,
    case p_agent_type
      when 'transcript' then 'realtime'
      when 'cards' then 'stateless'
      when 'facts' then 'stateless'
      else 'stateless'
    end
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
    connection_count,
    error_message,
    metadata,
    transport
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
    p_metadata,
    v_transport
  )
  returning id into v_history_id;

  return v_history_id;
end;
$$;

comment on function log_agent_session_history is 'Helper function to log connection events to agent_sessions_history table';

