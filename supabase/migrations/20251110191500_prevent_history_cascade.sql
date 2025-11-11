-- ============================================================================
-- Migration: Prevent cascading deletes from wiping agent_sessions_history
-- ============================================================================

set search_path to public;

-- Drop existing cascading foreign keys
alter table agent_sessions_history
  drop constraint if exists agent_sessions_history_agent_session_id_fkey,
  drop constraint if exists agent_sessions_history_event_id_fkey,
  drop constraint if exists agent_sessions_history_agent_id_fkey;

-- Allow history rows to outlive their parents
alter table agent_sessions_history
  alter column agent_session_id drop not null,
  alter column event_id drop not null,
  alter column agent_id drop not null;

-- Recreate foreign keys with ON DELETE SET NULL so history persists
alter table agent_sessions_history
  add constraint agent_sessions_history_agent_session_id_fkey
    foreign key (agent_session_id) references agent_sessions(id) on delete set null,
  add constraint agent_sessions_history_event_id_fkey
    foreign key (event_id) references events(id) on delete set null,
  add constraint agent_sessions_history_agent_id_fkey
    foreign key (agent_id) references agents(id) on delete set null;

comment on column agent_sessions_history.agent_session_id is 'Optional reference back to agent_sessions; set null if the original session record is deleted.';
comment on column agent_sessions_history.event_id is 'Optional reference back to events; set null if the original event record is deleted.';
comment on column agent_sessions_history.agent_id is 'Optional reference back to agents; set null if the original agent record is deleted.';
