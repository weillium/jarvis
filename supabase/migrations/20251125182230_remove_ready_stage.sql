-- ============================================================================
-- Remove legacy 'ready' stage from agents table
-- ============================================================================

-- Step 1: Update any agents with 'ready' stage to 'context_complete'
-- (ready was a legacy stage that meant context was complete and ready to start)
update agents
set stage = 'context_complete'
where stage = 'ready';

-- Step 2: Remove 'ready' from stage constraint
alter table agents
  drop constraint if exists agents_stage_check;

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
    'running'                -- Processing transcripts
  ) or stage is null);

-- Step 3: Update comment
comment on column agents.stage is 'Agent workflow stage: prepping, blueprint, researching, building_glossary, building_chunks, regenerating_*, context_complete, testing, running';

-- Step 4: Update helper function to remove 'ready' case
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
      when 'prepping' then 'Prepping'
      else 'Idle'
    end;
  else
    return 'Unknown';
  end if;
end;
$$ language plpgsql immutable;






