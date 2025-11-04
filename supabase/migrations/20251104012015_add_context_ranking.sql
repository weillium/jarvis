-- Migration: Add ranking and research source to context_items
-- Enhances context_items table with ranking and research source tracking
-- Generated: 2025-01-04

-- Add ranking column (1 = highest rank, 1000 = lowest rank)
alter table context_items
  add column if not exists rank int;

-- Add research source column
alter table context_items
  add column if not exists research_source text; -- e.g., 'exa', 'wikipedia', 'document', 'llm_generation'

-- Add quality score if not already exists (from previous migration)
-- Note: This might already exist from 20251103080000_enhance_context_items_schema.sql
-- Using IF NOT EXISTS pattern to avoid errors
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'context_items' and column_name = 'quality_score'
  ) then
    alter table context_items add column quality_score float;
  end if;
end $$;

-- Indexes for efficient querying by rank and source
create index if not exists idx_context_items_rank on context_items(event_id, rank) 
  where rank is not null;

create index if not exists idx_context_items_research_source on context_items(event_id, research_source)
  where research_source is not null;

-- Composite index for ranked queries (most common: get top N ranked chunks)
create index if not exists idx_context_items_event_rank on context_items(event_id, rank asc nulls last)
  where rank is not null;

-- Comments for documentation
comment on column context_items.rank is 'Chunk ranking: 1 = highest quality/relevance, higher numbers = lower priority. Used to select top N chunks (e.g., top 500 or 1000).';
comment on column context_items.research_source is 'Source of the research: exa, wikipedia, document, llm_generation, etc.';

