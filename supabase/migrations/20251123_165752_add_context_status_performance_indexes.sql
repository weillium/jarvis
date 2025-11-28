-- ============================================================================
-- Performance Optimization: Context Generation Panel Loading
-- 
-- This migration addresses slow loading of the context generation panel
-- on the agent context overview subtab. The panel polls /api/context/[eventId]/status
-- every 3 seconds, making 5-7 queries per request.
-- 
-- Root causes:
-- 1. Count queries on research_results and context_items use partial indexes
--    (where is_active = true) but count ALL rows, causing full table scans
-- 2. Generation cycles queries need agent_id and started_at in index for
--    efficient filtering and ordering
-- ============================================================================

-- 1. Research results: Add index for counting all rows by event_id
-- Query pattern: .eq('event_id', eventId) with count: 'exact'
-- The existing idx_research_results_event is a partial index (where is_active = true)
-- which doesn't help when counting all rows. This index will support both cases.
create index if not exists idx_research_results_event_count
  on research_results(event_id);

-- 2. Context items: Add index for counting all rows by event_id
-- Query pattern: .eq('event_id', eventId) with count: 'exact'
-- The existing idx_context_items_active is a partial index (where is_active = true)
-- which doesn't help when counting all rows. This index will support both cases.
create index if not exists idx_context_items_event_count
  on context_items(event_id);

-- 3. Generation cycles: Optimize queries that filter by event_id, agent_id, cycle_type, status
--    and order by started_at
-- Query patterns:
--   - .eq('event_id', eventId).eq('agent_id', agentId).eq('cycle_type', cycleType)
--     .in('status', ['started', 'processing']).order('started_at', { ascending: false })
--   - .eq('event_id', eventId).eq('agent_id', agentId).eq('cycle_type', cycleType)
--     .eq('status', 'completed').order('started_at', { ascending: false })
-- The existing indexes don't include agent_id or started_at, causing inefficient queries.
-- This composite index covers all filter and sort columns.
create index if not exists idx_generation_cycles_event_agent_type_status_started
  on generation_cycles(event_id, agent_id, cycle_type, status, started_at desc)
  where status != 'superseded';

-- Comments
comment on index idx_research_results_event_count is 'Optimizes count queries on research_results by event_id (counts all rows, not just active)';
comment on index idx_context_items_event_count is 'Optimizes count queries on context_items by event_id (counts all rows, not just active)';
comment on index idx_generation_cycles_event_agent_type_status_started is 'Optimizes generation cycles queries that filter by event_id, agent_id, cycle_type, status and order by started_at';






