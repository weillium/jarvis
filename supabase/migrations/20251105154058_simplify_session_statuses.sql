-- ============================================================================
-- Phase 5: Simplify Session Statuses
-- Remove generated/starting statuses, use timestamps instead
-- ============================================================================

-- Step 1: Migrate existing statuses
update agent_sessions
set status = case
  when status = 'generated' then 'closed' -- Not yet started, treat as closed
  when status = 'starting' then 'active'  -- Starting becomes active
  when status in ('active', 'paused', 'closed', 'error') then status
  else 'closed'
end;

-- Step 2: Update constraint
alter table agent_sessions
  drop constraint if exists agent_sessions_status_check;

alter table agent_sessions
  add constraint agent_sessions_status_check
  check (status in ('active', 'paused', 'closed', 'error'));

-- Step 3: Update comments
comment on column agent_sessions.status is 'Session lifecycle status: active (operational), paused (temporarily stopped), closed (ended), error (failed). Use created_at to determine if session is new.';

