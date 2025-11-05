-- ============================================================================
-- Phase 8: Add Missing Indexes
-- Add indexes for common query patterns
-- ============================================================================

-- Agent outputs: Latest cards per event
create index if not exists idx_agent_outputs_event_type_created_desc
  on agent_outputs(event_id, agent_type, created_at desc)
  where agent_type = 'cards' and type = 'card';

-- Facts: Recent updates per event
create index if not exists idx_facts_event_updated_desc
  on facts(event_id, updated_at desc);

-- Transcripts: Sequence-based queries (verify exists)
create index if not exists idx_transcripts_event_seq_asc
  on transcripts(event_id, seq asc nulls last);

-- Context items: Rank-based queries (verify exists)
create index if not exists idx_context_items_event_rank_asc
  on context_items(event_id, rank asc nulls last)
  where rank is not null;

-- Agent sessions: Active sessions per event
create index if not exists idx_agent_sessions_event_status
  on agent_sessions(event_id, status)
  where status = 'active';

-- Generation cycles: Active cycles per event
create index if not exists idx_generation_cycles_event_active
  on generation_cycles(event_id, status)
  where status in ('started', 'processing');

