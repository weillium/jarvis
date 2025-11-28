-- ============================================================================
-- Add index for duplicate card prevention
-- ---------------------------------------------------------------------------
-- This index optimizes the duplicate card check query that looks for cards
-- with the same (event_id, source_seq, is_active) combination.
-- ============================================================================

-- Index for duplicate card lookup: event_id + source_seq + is_active
-- This speeds up the getCardBySourceAndTemplate query in cards-repository.ts
create index if not exists idx_cards_event_source_active
  on cards(event_id, source_seq, is_active)
  where is_active = true;

comment on index idx_cards_event_source_active is 'Optimizes duplicate card prevention queries that check for existing cards with the same source_seq, template_id, and concept_id.';





