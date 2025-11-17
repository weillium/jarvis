-- ============================================================================
-- Phase 1: Simplify Agent Statuses
-- Split status into status (lifecycle) and stage (workflow)
-- ============================================================================

-- Step 1: Add stage column
alter table agents
  add column if not exists stage text;

-- Step 2: Migrate existing status values to stage
-- Map old statuses to new stage values
update agents
set stage = case
  when status in ('blueprint_generating', 'blueprint_ready', 'blueprint_approved') then 'blueprint'
  when status = 'researching' then 'researching'
  when status = 'building_glossary' then 'building_glossary'
  when status = 'building_chunks' then 'building_chunks'
  when status = 'regenerating_research' then 'regenerating_research'
  when status = 'regenerating_glossary' then 'regenerating_glossary'
  when status = 'regenerating_chunks' then 'regenerating_chunks'
  when status = 'context_complete' then 'context_complete'
  when status = 'testing' then 'testing'
  when status = 'running' then 'running'
  when status = 'prepping' then 'prepping' -- Legacy
  when status = 'ready' then 'ready' -- Legacy
  else null
end;

-- Step 3: Set status to lifecycle values
update agents
set status = case
  when status in ('idle', 'prepping', 'blueprint_generating', 'blueprint_ready', 
                  'blueprint_approved', 'researching', 'building_glossary', 
                  'building_chunks', 'regenerating_research', 'regenerating_glossary',
                  'regenerating_chunks', 'context_complete', 'testing', 'ready') then 'idle'
  when status = 'running' then 'active'
  when status in ('ended', 'error') then status
  else 'idle'
end;

-- Step 4: Update status constraint
alter table agents
  drop constraint if exists agents_status_check;

alter table agents
  add constraint agents_status_check
  check (status in ('idle', 'active', 'paused', 'ended', 'error'));

-- Step 5: Add stage constraint
alter table agents
  add constraint agents_stage_check
  check (stage in (
    'prepping',              -- Legacy: automatic context building
    'blueprint',             -- Blueprint generation (blueprint_generating/ready/approved)
    'researching',           -- Research phase
    'building_glossary',     -- Glossary construction
    'building_chunks',       -- Chunk construction
    'regenerating_research', -- Regenerating research
    'regenerating_glossary', -- Regenerating glossary
    'regenerating_chunks',   -- Regenerating chunks
    'context_complete',      -- Context ready
    'testing',               -- Testing sessions
    'ready',                 -- Legacy: ready to start
    'running'                -- Processing transcripts
  ) or stage is null);

-- Step 6: Create indexes
create index if not exists idx_agents_status on agents(status);
create index if not exists idx_agents_stage on agents(stage);
create index if not exists idx_agents_status_stage on agents(status, stage);

-- Step 7: Update comments
comment on column agents.status is 'Agent lifecycle status: idle (not active), active (processing), paused (temporarily stopped), ended (completed), error (failed)';
comment on column agents.stage is 'Agent workflow stage: prepping, blueprint, researching, building_glossary, building_chunks, regenerating_*, context_complete, testing, ready, running';

-- Step 8: Create helper function for backward compatibility
create or replace function get_agent_status_label(p_status text, p_stage text)
returns text as $$
begin
  -- Return human-readable status label
  if p_status = 'error' then
    return 'Error';
  elsif p_status = 'ended' then
    return 'Ended';
  elsif p_status = 'paused' then
    return 'Paused';
  elsif p_status = 'active' then
    return case p_stage
      when 'running' then 'Running'
      when 'testing' then 'Testing'
      else 'Active'
    end;
  elsif p_status = 'idle' then
    return case p_stage
      when 'blueprint' then 'Blueprint'
      when 'researching' then 'Researching'
      when 'building_glossary' then 'Building Glossary'
      when 'building_chunks' then 'Building Chunks'
      when 'regenerating_research' then 'Regenerating Research'
      when 'regenerating_glossary' then 'Regenerating Glossary'
      when 'regenerating_chunks' then 'Regenerating Chunks'
      when 'context_complete' then 'Context Complete'
      when 'testing' then 'Testing'
      when 'ready' then 'Ready'
      when 'prepping' then 'Prepping'
      else 'Idle'
    end;
  else
    return 'Unknown';
  end if;
end;
$$ language plpgsql immutable;

