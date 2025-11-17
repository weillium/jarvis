-- ============================================================================
-- Phase 8 Smoke Test
-- Verify that performance indexes were created
-- ============================================================================

-- Test 1: Verify agent_outputs index exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_agent_outputs_event_type_created_desc'
  ) THEN
    RAISE EXCEPTION 'FAIL: idx_agent_outputs_event_type_created_desc index missing';
  END IF;

  RAISE NOTICE 'PASS: idx_agent_outputs_event_type_created_desc index exists';
END $$;

-- Test 2: Verify facts index exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_facts_event_updated_desc'
  ) THEN
    RAISE EXCEPTION 'FAIL: idx_facts_event_updated_desc index missing';
  END IF;

  RAISE NOTICE 'PASS: idx_facts_event_updated_desc index exists';
END $$;

-- Test 3: Verify transcripts index exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_transcripts_event_seq_asc'
  ) THEN
    RAISE EXCEPTION 'FAIL: idx_transcripts_event_seq_asc index missing';
  END IF;

  RAISE NOTICE 'PASS: idx_transcripts_event_seq_asc index exists';
END $$;

-- Test 4: Verify context_items index exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_context_items_event_rank_asc'
  ) THEN
    RAISE EXCEPTION 'FAIL: idx_context_items_event_rank_asc index missing';
  END IF;

  RAISE NOTICE 'PASS: idx_context_items_event_rank_asc index exists';
END $$;

-- Test 5: Verify agent_sessions index exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_agent_sessions_event_status'
  ) THEN
    RAISE EXCEPTION 'FAIL: idx_agent_sessions_event_status index missing';
  END IF;

  RAISE NOTICE 'PASS: idx_agent_sessions_event_status index exists';
END $$;

-- Test 6: Verify generation_cycles index exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_generation_cycles_event_active'
  ) THEN
    RAISE EXCEPTION 'FAIL: idx_generation_cycles_event_active index missing';
  END IF;

  RAISE NOTICE 'PASS: idx_generation_cycles_event_active index exists';
END $$;

-- Test 7: Verify indexes are used in query plans (conceptual test)
-- Note: Actual EXPLAIN ANALYZE would require data, but we can verify index definition
DO $$
DECLARE
  index_count int;
BEGIN
  SELECT COUNT(*) INTO index_count
  FROM pg_indexes
  WHERE indexname IN (
    'idx_agent_outputs_event_type_created_desc',
    'idx_facts_event_updated_desc',
    'idx_transcripts_event_seq_asc',
    'idx_context_items_event_rank_asc',
    'idx_agent_sessions_event_status',
    'idx_generation_cycles_event_active'
  );
  
  IF index_count != 6 THEN
    RAISE EXCEPTION 'FAIL: Expected 6 indexes, found %', index_count;
  END IF;

  RAISE NOTICE 'PASS: All 6 indexes exist';
END $$;

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'All Phase 8 smoke tests PASSED!';
  RAISE NOTICE '========================================';
END $$;

