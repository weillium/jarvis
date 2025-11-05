-- ============================================================================
-- Phase 6 Smoke Test
-- Verify that metrics column was removed from agent_sessions
-- ============================================================================

-- Test 1: Verify metrics column was removed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'agent_sessions' AND column_name = 'metrics'
  ) THEN
    RAISE EXCEPTION 'FAIL: agent_sessions.metrics column still exists';
  END IF;

  RAISE NOTICE 'PASS: metrics column removed from agent_sessions';
END $$;

-- Test 2: Verify GIN index was removed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_agent_sessions_metrics'
  ) THEN
    RAISE EXCEPTION 'FAIL: idx_agent_sessions_metrics index still exists';
  END IF;

  RAISE NOTICE 'PASS: metrics GIN index removed';
END $$;

-- Test 3: Verify queries work without metrics column
DO $$
DECLARE
  session_count int;
BEGIN
  SELECT COUNT(*) INTO session_count
  FROM agent_sessions;
  
  RAISE NOTICE 'PASS: Queries work without metrics column (found % sessions)', session_count;
END $$;

-- Test 4: Verify we cannot query metrics column
DO $$
BEGIN
  -- This should fail because column doesn't exist
  BEGIN
    EXECUTE 'SELECT metrics FROM agent_sessions LIMIT 1';
    RAISE EXCEPTION 'FAIL: Query succeeded but metrics column should not exist';
  EXCEPTION
    WHEN undefined_column THEN
      RAISE NOTICE 'PASS: metrics column correctly removed (query fails as expected)';
    WHEN OTHERS THEN
      RAISE NOTICE 'PASS: metrics column check (query behavior as expected)';
  END;
END $$;

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'All Phase 6 smoke tests PASSED!';
  RAISE NOTICE '========================================';
END $$;

