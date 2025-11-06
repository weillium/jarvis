-- Migration: Remove unused functions
-- 1. Remove can_regenerate_component() - not used, references removed is_active columns
-- 2. Remove soft delete functions - no longer used after soft delete removal

-- Drop can_regenerate_component function
drop function if exists can_regenerate_component(uuid, text, uuid);

-- Drop soft delete functions (triggers were already dropped in previous migration)
drop function if exists soft_delete_context_items();
drop function if exists soft_delete_glossary_terms();
drop function if exists soft_delete_research_results();

-- Add comment explaining the cleanup
comment on function update_agent_on_cycle_complete() is 'No-op function. Agent status/stage transitions are managed by worker code, not database triggers. Generation cycles are marked as superseded to prevent UI visualization and downstream access.';

