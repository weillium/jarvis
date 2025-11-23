-- ============================================================================
-- Performance Optimization: Add Missing Indexes
-- 
-- This migration addresses slow page load times:
-- 1. /events page (11.7s) - missing index on events(owner_uid, created_at)
-- 2. /api/agent/[eventId] endpoint (2-3s) - optimize generation_cycles queries
-- 3. Count queries on context_items and glossary_terms
-- ============================================================================

-- 1. Events table: Critical index for getEvents() query
-- Query pattern: .eq('owner_uid', user.id).order('created_at', { ascending: false })
-- This index enables fast filtering by owner and sorting by creation date
create index if not exists idx_events_owner_created_desc
  on events(owner_uid, created_at desc);

-- 2. Events table: Index for search queries (title and topic)
-- Query pattern: .or(`title.ilike.%${search}%,topic.ilike.%${search}%`)
-- While ilike can't use indexes perfectly, having indexes on these columns helps
create index if not exists idx_events_owner_title
  on events(owner_uid, title text_pattern_ops);
  
create index if not exists idx_events_owner_topic
  on events(owner_uid, topic text_pattern_ops)
  where topic is not null;

-- 3. Generation cycles: Optimize queries that filter by event_id, cycle_type, and status
-- Query pattern: .eq('event_id', eventId).neq('status', 'superseded').in('cycle_type', ['chunks', 'research'])
-- The existing index doesn't cover the 'not superseded' filter efficiently
create index if not exists idx_generation_cycles_event_type_status
  on generation_cycles(event_id, cycle_type, status)
  where status != 'superseded';

-- 4. Context items: Optimize count queries with generation_cycle_id filters
-- Query pattern: .eq('event_id', eventId).or(`generation_cycle_id.is.null,generation_cycle_id.in.(...)`)
-- Add composite index to support both event_id filtering and generation_cycle_id lookups
create index if not exists idx_context_items_event_cycle_count
  on context_items(event_id, generation_cycle_id)
  where generation_cycle_id is not null;

-- 5. Glossary terms: Optimize count queries with generation_cycle_id filters
-- Query pattern: .eq('event_id', eventId).or(`generation_cycle_id.is.null,generation_cycle_id.in.(...)`)
create index if not exists idx_glossary_terms_event_cycle_count
  on glossary_terms(event_id, generation_cycle_id)
  where generation_cycle_id is not null;

-- 6. Agents: Index for event_id lookups (used in /api/agent endpoint)
-- Query pattern: .eq('event_id', eventId).limit(1)
create index if not exists idx_agents_event_id
  on agents(event_id);

-- 7. Context blueprints: Optimize latest blueprint query
-- Query pattern: .eq('agent_id', agentId).order('created_at', { ascending: false }).limit(1)
create index if not exists idx_context_blueprints_agent_created_desc
  on context_blueprints(agent_id, created_at desc);


