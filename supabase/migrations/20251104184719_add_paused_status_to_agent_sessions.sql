-- Migration: Add 'paused' status to agent_sessions table
-- Allows sessions to be paused (WebSocket closed) while preserving state for resume

-- Drop the existing check constraint
alter table agent_sessions
  drop constraint if exists agent_sessions_status_check;

-- Add the new constraint with 'paused' status
alter table agent_sessions
  add constraint agent_sessions_status_check
  check (status in ('starting', 'active', 'paused', 'closed', 'error'));

-- Add comment explaining the paused status
comment on column agent_sessions.status is 'Session status: starting (connecting), active (operational), paused (closed but state preserved for resume), closed (permanently ended), error (failed)';
