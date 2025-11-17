-- ============================================================================
-- Phase 3: Simplify Context Generation
-- Remove soft deletes and over-engineered versioning
-- ============================================================================

-- Step 1: Remove soft delete constraints and columns (Option A - keep data, remove constraints)
alter table context_items
  drop column if exists is_active,
  drop column if exists replaced_by,
  drop column if exists deleted_at,
  drop column if exists version;

alter table glossary_terms
  drop column if exists is_active,
  drop column if exists replaced_by,
  drop column if exists deleted_at,
  drop column if exists version;

alter table research_results
  drop column if exists is_active,
  drop column if exists replaced_by,
  drop column if exists deleted_at,
  drop column if exists version;

-- Step 2: Remove soft delete triggers
drop trigger if exists soft_delete_context_items_trigger on context_items;
drop trigger if exists soft_delete_glossary_terms_trigger on glossary_terms;
drop trigger if exists soft_delete_research_results_trigger on research_results;

-- Step 3: Remove soft delete functions
drop function if exists soft_delete_context_items();
drop function if exists soft_delete_glossary_terms();
drop function if exists soft_delete_research_results();

-- Step 4: Update unique constraints (remove WHERE is_active = true)
drop index if exists idx_glossary_terms_unique_active;
create unique index if not exists idx_glossary_terms_unique 
  on glossary_terms(event_id, lower(term));

-- Step 5: Remove component_dependencies table (if not used)
-- Keep generation_cycles for tracking, but remove dependencies table
drop table if exists component_dependencies;

-- Step 6: Remove indexes that referenced is_active
drop index if exists idx_context_items_active;
drop index if exists idx_glossary_terms_active;
drop index if exists idx_research_results_event;
drop index if exists idx_research_results_blueprint;

-- Step 7: Create new indexes (without is_active filter)
create index if not exists idx_context_items_event_cycle 
  on context_items(event_id, generation_cycle_id);

create index if not exists idx_glossary_terms_event_cycle 
  on glossary_terms(event_id, generation_cycle_id);

create index if not exists idx_research_results_event_cycle 
  on research_results(event_id, generation_cycle_id);

-- Step 8: Update comments
comment on table context_items is 'Context chunks for vector search. Each chunk belongs to a generation_cycle.';
comment on table glossary_terms is 'Glossary terms for events. Each term belongs to a generation_cycle.';
comment on table research_results is 'Research results for events. Each result belongs to a generation_cycle.';
comment on table generation_cycles is 'Tracks generation cycles. Use this to identify which items belong to which generation.';

