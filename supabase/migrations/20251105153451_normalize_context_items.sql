-- ============================================================================
-- Phase 4: Normalize Context Items
-- Consolidate metadata columns into JSONB
-- ============================================================================

-- Step 1: Consolidate metadata into existing metadata column
-- Merge existing column values into metadata JSONB, preserving existing metadata values
update context_items
set metadata = jsonb_build_object(
  'source', coalesce(source, metadata->>'source'),
  'enrichment_source', coalesce(enrichment_source::text, metadata->>'enrichment_source'),
  'research_source', coalesce(research_source, metadata->>'research_source'),
  'component_type', coalesce(component_type, metadata->>'component_type'),
  'quality_score', coalesce(quality_score::text, metadata->>'quality_score'),
  'chunk_size', coalesce(chunk_size::text, metadata->>'chunk_size'),
  'enrichment_timestamp', coalesce(enrichment_timestamp::text, metadata->>'enrichment_timestamp')
)
where metadata is null or metadata = '{}'::jsonb or 
  (source is not null or enrichment_source is not null or research_source is not null 
   or component_type is not null or quality_score is not null or chunk_size is not null 
   or enrichment_timestamp is not null);

-- Step 2: Merge existing metadata with column values (preserve existing metadata keys)
update context_items
set metadata = metadata || jsonb_build_object(
  'source', coalesce(metadata->>'source', source),
  'enrichment_source', coalesce(metadata->>'enrichment_source', enrichment_source::text),
  'research_source', coalesce(metadata->>'research_source', research_source),
  'component_type', coalesce(metadata->>'component_type', component_type),
  'quality_score', coalesce(metadata->>'quality_score', quality_score::text),
  'chunk_size', coalesce(metadata->>'chunk_size', chunk_size::text),
  'enrichment_timestamp', coalesce(metadata->>'enrichment_timestamp', enrichment_timestamp::text)
)
where metadata is not null and metadata != '{}'::jsonb;

-- Step 3: Remove redundant columns (keep core columns)
alter table context_items
  drop column if exists source,
  drop column if exists enrichment_source,
  drop column if exists research_source,
  drop column if exists component_type,
  drop column if exists quality_score,
  drop column if exists chunk_size,
  drop column if exists enrichment_timestamp;

-- Step 4: Update indexes
drop index if exists idx_context_items_enrichment_source;
drop index if exists idx_context_items_research_source;
drop index if exists idx_context_items_component_type;
drop index if exists idx_context_items_quality;

-- Step 5: Create GIN index on metadata for efficient queries
create index if not exists idx_context_items_metadata_gin 
  on context_items using gin(metadata)
  where metadata is not null;

-- Step 6: Create function to extract common metadata values
create or replace function get_context_item_source(p_item context_items)
returns text as $$
begin
  return coalesce(
    p_item.metadata->>'source',
    p_item.metadata->>'enrichment_source',
    p_item.metadata->>'research_source',
    'unknown'
  );
end;
$$ language plpgsql immutable;

-- Step 7: Update comments
comment on column context_items.metadata is 'JSONB metadata containing: source, enrichment_source, research_source, component_type, quality_score, chunk_size, enrichment_timestamp';
comment on column context_items.chunk is 'The text chunk content';
comment on column context_items.embedding is 'Vector embedding (1536 dimensions)';
comment on column context_items.rank is 'Ranking score (1 = highest, higher = lower priority)';

