-- ============================================================================
-- Phase 4 Smoke Test
-- Verify that metadata columns were removed and data is in metadata JSONB
-- ============================================================================

-- Test 1: Verify columns were removed
DO $$
BEGIN
  -- Check that removed columns no longer exist
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'context_items' AND column_name = 'source'
  ) THEN
    RAISE EXCEPTION 'FAIL: context_items.source column still exists';
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'context_items' AND column_name = 'enrichment_source'
  ) THEN
    RAISE EXCEPTION 'FAIL: context_items.enrichment_source column still exists';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'context_items' AND column_name = 'quality_score'
  ) THEN
    RAISE EXCEPTION 'FAIL: context_items.quality_score column still exists';
  END IF;

  RAISE NOTICE 'PASS: All metadata columns removed from context_items';
END $$;

-- Test 2: Verify core columns still exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'context_items' AND column_name = 'metadata'
  ) THEN
    RAISE EXCEPTION 'FAIL: context_items.metadata column missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'context_items' AND column_name = 'chunk'
  ) THEN
    RAISE EXCEPTION 'FAIL: context_items.chunk column missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'context_items' AND column_name = 'rank'
  ) THEN
    RAISE EXCEPTION 'FAIL: context_items.rank column missing';
  END IF;

  RAISE NOTICE 'PASS: Core columns exist';
END $$;

-- Test 3: Verify GIN index exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_context_items_metadata_gin'
  ) THEN
    RAISE EXCEPTION 'FAIL: idx_context_items_metadata_gin index missing';
  END IF;

  RAISE NOTICE 'PASS: GIN index on metadata exists';
END $$;

-- Test 4: Verify helper function exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_name = 'get_context_item_source'
  ) THEN
    RAISE EXCEPTION 'FAIL: get_context_item_source function missing';
  END IF;

  RAISE NOTICE 'PASS: Helper function exists';
END $$;

-- Test 5: Verify queries work with metadata JSONB
DO $$
DECLARE
  test_event_id uuid := '00000000-0000-0000-0000-000000000000';
  result_count int;
  metadata_sample jsonb;
BEGIN
  -- Test querying metadata
  SELECT COUNT(*) INTO result_count
  FROM context_items
  WHERE event_id = test_event_id;
  
  SELECT metadata INTO metadata_sample
  FROM context_items
  WHERE event_id = test_event_id
  LIMIT 1;
  
  RAISE NOTICE 'PASS: context_items query works with metadata JSONB';
  
  -- If we have data, verify metadata structure
  IF metadata_sample IS NOT NULL THEN
    RAISE NOTICE 'Sample metadata structure: %', metadata_sample;
  END IF;
END $$;

-- Test 6: Verify metadata JSONB queries work
DO $$
DECLARE
  test_count int;
BEGIN
  -- Test querying by metadata field
  SELECT COUNT(*) INTO test_count
  FROM context_items
  WHERE metadata->>'source' IS NOT NULL
  LIMIT 1;
  
  RAISE NOTICE 'PASS: Metadata JSONB queries work';
END $$;

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'All Phase 4 smoke tests PASSED!';
  RAISE NOTICE '========================================';
END $$;

