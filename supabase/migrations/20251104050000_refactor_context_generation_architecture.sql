-- Migration: Refactor Context Generation Architecture for Modular Regeneration
-- Adds versioning, independent storage, and generation cycle tracking
-- Generated: 2024-11-04

-- ============================================================================
-- 1. Update context_blueprints: Remove unnecessary statuses, add versioning
-- ============================================================================

-- Drop existing constraint
alter table context_blueprints
  drop constraint if exists context_blueprints_status_check;

-- Update existing 'executing' or 'completed' statuses to 'approved' (execution tracked via agent status)
update context_blueprints
set status = 'approved'
where status in ('executing', 'completed');

-- Add new constraint without 'executing' and 'completed' (use agent status instead)
alter table context_blueprints
  add constraint context_blueprints_status_check
  check (status in ('generating', 'ready', 'approved', 'error'));

-- Add versioning columns
alter table context_blueprints
  add column if not exists version int default 1,
  add column if not exists parent_version_id uuid references context_blueprints(id),
  add column if not exists is_active boolean default true,
  add column if not exists replaced_by uuid references context_blueprints(id),
  add column if not exists superseded_at timestamptz;

-- Update comment
comment on column context_blueprints.status is 'Blueprint status: generating -> ready -> approved. Execution status tracked via agent status and generation_cycles.';

-- ============================================================================
-- 2. Create generation_cycles table
-- ============================================================================

create table if not exists generation_cycles (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade not null,
  agent_id uuid references agents(id) on delete cascade not null,
  blueprint_id uuid references context_blueprints(id) on delete cascade not null,
  
  -- Cycle metadata
  cycle_type text not null check (cycle_type in ('blueprint', 'research', 'glossary', 'chunks', 'rankings', 'embeddings', 'full')),
  component text check (component in ('blueprint', 'research', 'glossary', 'llm_chunks', 'rankings', 'embeddings')),
  
  -- Status tracking
  status text not null check (status in ('started', 'processing', 'completed', 'failed', 'superseded')),
  error_message text,
  
  -- Progress tracking
  progress_current int default 0,
  progress_total int default 0,
  
  -- Timestamps
  started_at timestamptz default now(),
  completed_at timestamptz,
  
  -- Versioning
  version int default 1,
  parent_cycle_id uuid references generation_cycles(id),
  
  -- Metadata
  metadata jsonb
);

-- Indexes
create index if not exists idx_generation_cycles_event on generation_cycles(event_id, status);
create index if not exists idx_generation_cycles_agent on generation_cycles(agent_id, status);
create index if not exists idx_generation_cycles_blueprint on generation_cycles(blueprint_id, status);
create index if not exists idx_generation_cycles_type on generation_cycles(cycle_type, status);
create index if not exists idx_generation_cycles_active on generation_cycles(event_id, cycle_type, status) where status in ('started', 'processing', 'completed');

-- Comments
comment on table generation_cycles is 'Tracks individual generation cycles for each component (research, glossary, chunks, etc.)';
comment on column generation_cycles.cycle_type is 'Type of generation cycle: blueprint, research, glossary, chunks, rankings, embeddings, or full';
comment on column generation_cycles.component is 'Specific component being generated within the cycle';
comment on column generation_cycles.status is 'Cycle status: started -> processing -> completed/failed/superseded';

-- ============================================================================
-- 3. Create research_results table
-- ============================================================================

create table if not exists research_results (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade not null,
  blueprint_id uuid references context_blueprints(id) on delete cascade not null,
  generation_cycle_id uuid references generation_cycles(id) on delete set null,
  
  -- Research content
  query text not null,
  api text not null check (api in ('exa', 'wikipedia', 'llm_stub')),
  content text not null, -- The research chunk text
  
  -- Metadata
  source_url text,
  quality_score float check (quality_score >= 0 and quality_score <= 1),
  metadata jsonb,
  
  -- Versioning
  version int default 1,
  is_active boolean default true,
  replaced_by uuid references research_results(id),
  deleted_at timestamptz,
  
  -- Timestamps
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index if not exists idx_research_results_event on research_results(event_id, is_active) where is_active = true;
create index if not exists idx_research_results_blueprint on research_results(blueprint_id, is_active) where is_active = true;
create index if not exists idx_research_results_cycle on research_results(generation_cycle_id) where generation_cycle_id is not null;
create index if not exists idx_research_results_api on research_results(event_id, api, is_active) where is_active = true;

-- Comments
comment on table research_results is 'Stores research results independently from context chunks, enabling modular regeneration';
comment on column research_results.generation_cycle_id is 'Links to the generation cycle that created this research result';

-- ============================================================================
-- 4. Enhance glossary_terms with versioning
-- ============================================================================

alter table glossary_terms
  add column if not exists generation_cycle_id uuid references generation_cycles(id) on delete set null,
  add column if not exists version int default 1,
  add column if not exists is_active boolean default true,
  add column if not exists replaced_by uuid references glossary_terms(id),
  add column if not exists deleted_at timestamptz;

-- Update unique constraint to allow versioning (only enforce uniqueness for active terms)
drop index if exists idx_glossary_terms_unique;
create unique index if not exists idx_glossary_terms_unique_active 
  on glossary_terms(event_id, lower(term)) 
  where is_active = true;

-- Index for generation cycles
create index if not exists idx_glossary_terms_cycle on glossary_terms(generation_cycle_id) where generation_cycle_id is not null;
create index if not exists idx_glossary_terms_active on glossary_terms(event_id, is_active) where is_active = true;

-- Comments
comment on column glossary_terms.generation_cycle_id is 'Links to the generation cycle that created this glossary term';
comment on column glossary_terms.is_active is 'Soft delete flag: false means this term was replaced or deleted';
comment on column glossary_terms.version is 'Version number for this term (increments on regeneration)';

-- ============================================================================
-- 5. Enhance context_items with versioning and component tracking
-- ============================================================================

alter table context_items
  add column if not exists generation_cycle_id uuid references generation_cycles(id) on delete set null,
  add column if not exists component_type text check (component_type in ('research', 'llm_generated', 'ranked')),
  add column if not exists version int default 1,
  add column if not exists is_active boolean default true,
  add column if not exists replaced_by uuid references context_items(id),
  add column if not exists deleted_at timestamptz;

-- Update existing data: mark research chunks
update context_items
set component_type = 'research',
    is_active = true
where research_source in ('exa', 'wikipedia', 'research_stub');

-- Update existing data: mark LLM-generated chunks
update context_items
set component_type = 'llm_generated',
    is_active = true
where research_source = 'llm_generation';

-- Update existing data: mark ranked chunks (have rank)
update context_items
set component_type = 'ranked',
    is_active = true
where rank is not null and component_type is null;

-- Indexes
create index if not exists idx_context_items_component_type on context_items(event_id, component_type, is_active) where is_active = true;
create index if not exists idx_context_items_cycle on context_items(generation_cycle_id) where generation_cycle_id is not null;
create index if not exists idx_context_items_active on context_items(event_id, is_active) where is_active = true;

-- Comments
comment on column context_items.generation_cycle_id is 'Links to the generation cycle that created this chunk';
comment on column context_items.component_type is 'Type of chunk: research (from research phase), llm_generated (pure LLM), or ranked (final ranked chunk)';
comment on column context_items.is_active is 'Soft delete flag: false means this chunk was replaced or deleted';

-- ============================================================================
-- 6. Create component_dependencies table
-- ============================================================================

create table if not exists component_dependencies (
  id uuid primary key default gen_random_uuid(),
  component_type text not null check (component_type in ('research', 'glossary', 'chunks', 'rankings', 'embeddings')),
  component_cycle_id uuid references generation_cycles(id) on delete cascade,
  depends_on_type text not null,
  depends_on_cycle_id uuid references generation_cycles(id) on delete cascade,
  depends_on_version int not null,
  
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_component_dependencies_component on component_dependencies(component_cycle_id);
create index if not exists idx_component_dependencies_depends on component_dependencies(depends_on_cycle_id);

-- Comments
comment on table component_dependencies is 'Tracks dependencies between generation cycles (e.g., glossary depends on research)';

-- ============================================================================
-- 7. Create triggers for soft delete and versioning
-- ============================================================================

-- Soft delete function for context_items
create or replace function soft_delete_context_items()
returns trigger as $$
begin
  update context_items
  set is_active = false, deleted_at = now()
  where id = old.id;
  return old;
end;
$$ language plpgsql;

-- Soft delete function for glossary_terms
create or replace function soft_delete_glossary_terms()
returns trigger as $$
begin
  update glossary_terms
  set is_active = false, deleted_at = now()
  where id = old.id;
  return old;
end;
$$ language plpgsql;

-- Soft delete function for research_results
create or replace function soft_delete_research_results()
returns trigger as $$
begin
  update research_results
  set is_active = false, deleted_at = now()
  where id = old.id;
  return old;
end;
$$ language plpgsql;

-- Create triggers (only if they don't exist)
drop trigger if exists soft_delete_context_items_trigger on context_items;
create trigger soft_delete_context_items_trigger
  before delete on context_items
  for each row
  execute function soft_delete_context_items();

drop trigger if exists soft_delete_glossary_terms_trigger on glossary_terms;
create trigger soft_delete_glossary_terms_trigger
  before delete on glossary_terms
  for each row
  execute function soft_delete_glossary_terms();

drop trigger if exists soft_delete_research_results_trigger on research_results;
create trigger soft_delete_research_results_trigger
  before delete on research_results
  for each row
  execute function soft_delete_research_results();

-- Generation cycle completion trigger
create or replace function update_agent_on_cycle_complete()
returns trigger as $$
begin
  if new.status = 'completed' and old.status != 'completed' then
    -- Update agent status based on cycle type
    if new.cycle_type = 'research' then
      update agents set status = 'researching' where id = new.agent_id;
    elsif new.cycle_type = 'glossary' then
      update agents set status = 'building_glossary' where id = new.agent_id;
    elsif new.cycle_type = 'chunks' then
      update agents set status = 'building_chunks' where id = new.agent_id;
    elsif new.cycle_type = 'full' then
      update agents set status = 'context_complete' where id = new.agent_id;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists agent_status_on_cycle_complete on generation_cycles;
create trigger agent_status_on_cycle_complete
  after update on generation_cycles
  for each row
  when (new.status = 'completed' and old.status != 'completed')
  execute function update_agent_on_cycle_complete();

-- ============================================================================
-- 8. Helper function: Check if regeneration is safe
-- ============================================================================

create or replace function can_regenerate_component(
  p_event_id uuid,
  p_component text,
  p_blueprint_id uuid
) returns boolean as $$
declare
  v_depends_on_active boolean;
begin
  -- Check if dependencies are active
  if p_component = 'glossary' then
    -- Glossary depends on research
    select exists(
      select 1 from research_results 
      where event_id = p_event_id 
        and blueprint_id = p_blueprint_id 
        and is_active = true
    ) into v_depends_on_active;
    return v_depends_on_active;
  elsif p_component = 'chunks' then
    -- Chunks depend on research
    select exists(
      select 1 from research_results 
      where event_id = p_event_id 
        and blueprint_id = p_blueprint_id 
        and is_active = true
    ) into v_depends_on_active;
    return v_depends_on_active;
  elsif p_component = 'rankings' then
    -- Rankings depend on chunks
    select exists(
      select 1 from context_items 
      where event_id = p_event_id 
        and is_active = true
        and component_type in ('research', 'llm_generated')
    ) into v_depends_on_active;
    return v_depends_on_active;
  end if;
  return true;
end;
$$ language plpgsql;

comment on function can_regenerate_component is 'Checks if a component can be regenerated (dependencies exist and are active)';

