-- Migration: Add research chunk flag to context_items
-- Allows selective deletion during chunks regeneration (preserve research chunks)
-- Generated: 2024-11-04

-- Add flag to identify research chunks
alter table context_items
  add column if not exists is_research_chunk boolean default false;

-- Update existing data: mark chunks with research_source as research chunks
update context_items
set is_research_chunk = true
where research_source in ('exa', 'wikipedia', 'research_stub');

-- Create index for efficient filtering
create index if not exists idx_context_items_is_research 
  on context_items(event_id, is_research_chunk)
  where is_research_chunk = true;

-- Comments for documentation
comment on column context_items.is_research_chunk is 'Flag indicating if this chunk is from research phase (exa, wikipedia, etc.). These chunks should be preserved during chunks regeneration if research hasn''t changed.';

