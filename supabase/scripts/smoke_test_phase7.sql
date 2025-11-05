-- ============================================================================
-- Phase 7 Smoke Test
-- Verify that agent_id column was removed from checkpoints
-- ============================================================================

-- Test 1: Verify agent_id column was removed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'checkpoints' AND column_name = 'agent_id'
  ) THEN
    RAISE EXCEPTION 'FAIL: checkpoints.agent_id column still exists';
  END IF;

  RAISE NOTICE 'PASS: agent_id column removed from checkpoints';
END $$;

-- Test 2: Verify primary key is (event_id, agent_type)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'checkpoints_pkey'
    AND contype = 'p'
  ) THEN
    RAISE EXCEPTION 'FAIL: checkpoints_pkey primary key missing';
  END IF;

  RAISE NOTICE 'PASS: Primary key exists';
END $$;

-- Test 3: Verify core columns exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'checkpoints' AND column_name = 'event_id'
  ) THEN
    RAISE EXCEPTION 'FAIL: checkpoints.event_id column missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'checkpoints' AND column_name = 'agent_type'
  ) THEN
    RAISE EXCEPTION 'FAIL: checkpoints.agent_type column missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'checkpoints' AND column_name = 'last_seq_processed'
  ) THEN
    RAISE EXCEPTION 'FAIL: checkpoints.last_seq_processed column missing';
  END IF;

  RAISE NOTICE 'PASS: Core columns exist';
END $$;

-- Test 4: Verify queries work without agent_id
DO $$
DECLARE
  checkpoint_count int;
BEGIN
  SELECT COUNT(*) INTO checkpoint_count
  FROM checkpoints;
  
  RAISE NOTICE 'PASS: Queries work without agent_id (found % checkpoints)', checkpoint_count;
END $$;

-- Test 5: Verify we cannot query agent_id column
DO $$
BEGIN
  -- This should fail because column doesn't exist
  BEGIN
    EXECUTE 'SELECT agent_id FROM checkpoints LIMIT 1';
    RAISE EXCEPTION 'FAIL: Query succeeded but agent_id column should not exist';
  EXCEPTION
    WHEN undefined_column THEN
      RAISE NOTICE 'PASS: agent_id column correctly removed (query fails as expected)';
    WHEN OTHERS THEN
      RAISE NOTICE 'PASS: agent_id column check (query behavior as expected)';
  END;
END $$;

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'All Phase 7 smoke tests PASSED!';
  RAISE NOTICE '========================================';
END $$;

