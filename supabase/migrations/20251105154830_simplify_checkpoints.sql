-- ============================================================================
-- Phase 7: Simplify Checkpoints
-- Remove agent_id from checkpoints (use agent_type only)
-- ============================================================================

-- Step 1: Migrate data (ensure no duplicates)
-- If multiple agents exist per event, use the latest checkpoint
-- Create temporary table with deduplicated checkpoints
create temporary table latest_checkpoints_temp as
select distinct on (event_id, agent_type)
  event_id,
  agent_type,
  last_seq_processed,
  updated_at
from checkpoints
order by event_id, agent_type, updated_at desc;

-- Clear and repopulate
truncate checkpoints;

insert into checkpoints (event_id, agent_type, last_seq_processed, updated_at)
select event_id, agent_type, last_seq_processed, updated_at
from latest_checkpoints_temp;

drop table latest_checkpoints_temp;

-- Step 2: Remove agent_id column
alter table checkpoints
  drop column if exists agent_id,
  drop constraint if exists checkpoints_agent_id_fkey;

-- Step 3: Update primary key (already correct: event_id, agent_type)
-- Verify constraint
alter table checkpoints
  drop constraint if exists checkpoints_pkey;

alter table checkpoints
  add primary key (event_id, agent_type);

-- Step 4: Update comments
comment on table checkpoints is 'Tracks processing progress per agent type (cards/facts) per event. Used for resume capability after restart.';

