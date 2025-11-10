-- Migration: ensure agent session model metadata is available

-- agent_sessions -------------------------------------------------------------

alter table agent_sessions
  add column if not exists model text;

comment on column agent_sessions.model is 'Model identifier recorded for this agent session.';

-- agent_sessions_history -----------------------------------------------------

alter table agent_sessions_history
  add column if not exists model text;

comment on column agent_sessions_history.model is 'Model identifier captured when logging this session history entry.';

