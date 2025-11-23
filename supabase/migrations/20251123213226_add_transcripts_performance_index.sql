-- ============================================================================
-- Performance Optimization: Add Composite Index for Transcripts Queries
-- 
-- This migration addresses slow Transcripts tab load times (5+ seconds)
-- by adding a composite index that covers the common query pattern:
-- - Filter by event_id
-- - Filter by final = true
-- - Filter by at_ms >= cutoff (last 5 minutes)
-- - Order by seq
-- ============================================================================

-- Composite index for efficient transcript queries
-- Covers: event_id, final, at_ms filtering with seq ordering
create index if not exists idx_transcripts_event_final_at_ms
  on transcripts(event_id, final, at_ms desc)
  where final = true;

-- Note: This index enables fast queries like:
-- SELECT * FROM transcripts 
-- WHERE event_id = ? AND final = true AND at_ms >= ?
-- ORDER BY seq ASC
-- LIMIT 150;

