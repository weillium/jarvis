-- ============================================================================
-- Phase 3 Smoke Test
-- Verify that soft delete columns were removed and queries work
-- ============================================================================

-- Test 1: Verify columns were removed
DO $$
BEGIN
  -- Check context_items
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'context_items' AND column_name = 'is_active'
  ) THEN
    RAISE EXCEPTION 'FAIL: context_items.is_active column still exists';
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'context_items' AND column_name = 'deleted_at'
  ) THEN
    RAISE EXCEPTION 'FAIL: context_items.deleted_at column still exists';
  END IF;

  -- Check glossary_terms
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'glossary_terms' AND column_name = 'is_active'
  ) THEN
    RAISE EXCEPTION 'FAIL: glossary_terms.is_active column still exists';
  END IF;

  -- Check research_results
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'research_results' AND column_name = 'is_active'
  ) THEN
    RAISE EXCEPTION 'FAIL: research_results.is_active column still exists';
  END IF;

  RAISE NOTICE 'PASS: All soft delete columns removed';
END $$;

-- Test 2: Verify new indexes exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_context_items_event_cycle'
  ) THEN
    RAISE EXCEPTION 'FAIL: idx_context_items_event_cycle index missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_glossary_terms_event_cycle'
  ) THEN
    RAISE EXCEPTION 'FAIL: idx_glossary_terms_event_cycle index missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_research_results_event_cycle'
  ) THEN
    RAISE EXCEPTION 'FAIL: idx_research_results_event_cycle index missing';
  END IF;

  RAISE NOTICE 'PASS: All new indexes exist';
END $$;

-- Test 3: Verify queries work without is_active
DO $$
DECLARE
  test_event_id uuid := '00000000-0000-0000-0000-000000000000';
  result_count int;
BEGIN
  -- Test context_items query (should not error)
  SELECT COUNT(*) INTO result_count
  FROM context_items
  WHERE event_id = test_event_id;
  
  RAISE NOTICE 'PASS: context_items query works without is_active';

  -- Test glossary_terms query
  SELECT COUNT(*) INTO result_count
  FROM glossary_terms
  WHERE event_id = test_event_id;
  
  RAISE NOTICE 'PASS: glossary_terms query works without is_active';

  -- Test research_results query
  SELECT COUNT(*) INTO result_count
  FROM research_results
  WHERE event_id = test_event_id;
  
  RAISE NOTICE 'PASS: research_results query works without is_active';
END $$;

-- Test 4: Verify component_dependencies table was removed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'component_dependencies'
  ) THEN
    RAISE EXCEPTION 'FAIL: component_dependencies table still exists';
  END IF;

  RAISE NOTICE 'PASS: component_dependencies table removed';
END $$;

-- Test 5: Verify generation_cycles table still exists (for tracking)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'generation_cycles'
  ) THEN
    RAISE EXCEPTION 'FAIL: generation_cycles table missing';
  END IF;

  RAISE NOTICE 'PASS: generation_cycles table exists';
END $$;

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'All Phase 3 smoke tests PASSED!';
  RAISE NOTICE '========================================';
END $$;

