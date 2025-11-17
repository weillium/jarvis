-- Add is_active column to facts table
-- This field indicates whether a fact should be in the FactsStore for an event
-- TRUE = fact is active and should be in memory
-- FALSE = fact is inactive (purged or evicted) and should not be in memory

alter table facts
  add column if not exists is_active boolean not null default true;

-- Create index for filtering active facts by event (most common query)
create index if not exists idx_facts_event_active
  on facts(event_id, is_active)
  where is_active = true;

-- Create index for event_id + is_active combination (for purging queries)
create index if not exists idx_facts_event_is_active
  on facts(event_id, is_active);

-- Add comment explaining the column
comment on column facts.is_active is 'Whether this fact should be in FactsStore memory. FALSE when purged or evicted from memory.';

