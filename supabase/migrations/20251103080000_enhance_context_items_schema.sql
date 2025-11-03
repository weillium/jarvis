-- Migration: Enhance context_items table for external enrichment
-- Adds metadata tracking, quality scoring, and enrichment source information
-- Generated: 2025-01-04

-- Add new columns for enrichment tracking
alter table context_items
  add column if not exists metadata jsonb,
  add column if not exists quality_score float,
  add column if not exists enrichment_timestamp timestamptz default now(),
  add column if not exists chunk_size int,
  add column if not exists enrichment_source text;

-- Index for quality-based queries (useful for filtering high-quality chunks)
create index if not exists idx_context_items_quality
  on context_items(event_id, quality_score desc)
  where quality_score is not null;

-- Index for enrichment source queries (useful for debugging and analytics)
create index if not exists idx_context_items_enrichment_source
  on context_items(event_id, enrichment_source)
  where enrichment_source is not null;

-- Index for metadata queries (useful for filtering by enrichment type)
create index if not exists idx_context_items_metadata
  on context_items using gin(metadata)
  where metadata is not null;

-- Comments for documentation
comment on column context_items.metadata is 'JSONB metadata about the enrichment source (enricher name, URLs, API responses, etc.)';
comment on column context_items.quality_score is 'Quality score 0-1 indicating chunk quality/relevance (optional)';
comment on column context_items.enrichment_timestamp is 'When this chunk was enriched (for tracking enrichment timing)';
comment on column context_items.chunk_size is 'Character length of the chunk (for analytics and optimization)';
comment on column context_items.enrichment_source is 'Name of the enricher that created this chunk (e.g., "web_search", "document_extractor", "wikipedia")';

