-- Migration: Fix agent status trigger to use status/stage architecture
-- The trigger was trying to set invalid status values (researching, building_glossary, etc.)
-- These should be set as 'stage' values, not 'status' values

-- Drop the old trigger
drop trigger if exists agent_status_on_cycle_complete on generation_cycles;

-- Update the function to use status/stage architecture correctly
-- The trigger should NOT update agent status automatically because:
-- 1. Agent status/stage is managed by the worker code
-- 2. The trigger can't know the correct next stage (e.g., research completes -> should move to glossary, not stay at researching)
-- 3. The worker already handles stage transitions explicitly

-- Create a no-op function (or remove the trigger entirely)
-- For now, we'll just remove the trigger since the worker manages agent status/stage transitions
create or replace function update_agent_on_cycle_complete()
returns trigger as $$
begin
  -- No-op: The worker code manages agent status/stage transitions explicitly
  -- This trigger was causing errors by trying to set invalid status values
  -- The worker already handles stage transitions when cycles complete
  return new;
end;
$$ language plpgsql;

-- Recreate the trigger (but it's now a no-op)
-- We keep it for backward compatibility in case any code depends on it existing
create trigger agent_status_on_cycle_complete
  after update on generation_cycles
  for each row
  when (new.status = 'completed' and old.status != 'completed')
  execute function update_agent_on_cycle_complete();

-- Add comment explaining why this is a no-op
comment on function update_agent_on_cycle_complete() is 'No-op function. Agent status/stage transitions are managed by worker code, not database triggers. This trigger exists for backward compatibility only.';

