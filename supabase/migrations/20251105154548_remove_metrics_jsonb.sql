-- ============================================================================
-- Phase 6: Remove Metrics JSONB
-- Remove metrics column from agent_sessions
-- ============================================================================

-- Step 1: Drop metrics column
alter table agent_sessions
  drop column if exists metrics;

-- Step 2: Drop GIN index on metrics
drop index if exists idx_agent_sessions_metrics;

-- Step 3: Update comments
comment on table agent_sessions is 'Tracks OpenAI Realtime API sessions. Metrics are available via SSE/API, not stored in database.';

