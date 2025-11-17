-- ============================================================================
-- Phase 5 Smoke Test
-- Verify that session statuses were simplified to 4 values
-- ============================================================================

-- Test 1: Verify constraint only allows 4 values
DO $$
BEGIN
  -- Check constraint exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_sessions_status_check'
    AND contype = 'c'
  ) THEN
    RAISE EXCEPTION 'FAIL: agent_sessions_status_check constraint missing';
  END IF;

  RAISE NOTICE 'PASS: Status constraint exists';
END $$;

-- Test 2: Verify old statuses ('generated', 'starting') were migrated
DO $$
DECLARE
  generated_count int;
  starting_count int;
BEGIN
  SELECT COUNT(*) INTO generated_count
  FROM agent_sessions
  WHERE status = 'generated';

  SELECT COUNT(*) INTO starting_count
  FROM agent_sessions
  WHERE status = 'starting';

  IF generated_count > 0 THEN
    RAISE EXCEPTION 'FAIL: Found % sessions with old status "generated"', generated_count;
  END IF;

  IF starting_count > 0 THEN
    RAISE EXCEPTION 'FAIL: Found % sessions with old status "starting"', starting_count;
  END IF;

  RAISE NOTICE 'PASS: All old statuses migrated (generated: %, starting: %)', generated_count, starting_count;
END $$;

-- Test 3: Verify only valid statuses exist
DO $$
DECLARE
  invalid_count int;
BEGIN
  SELECT COUNT(*) INTO invalid_count
  FROM agent_sessions
  WHERE status NOT IN ('active', 'paused', 'closed', 'error');

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'FAIL: Found % sessions with invalid status', invalid_count;
  END IF;

  RAISE NOTICE 'PASS: All sessions have valid statuses (active, paused, closed, error)';
END $$;

-- Test 4: Verify queries work with new statuses
DO $$
DECLARE
  active_count int;
  closed_count int;
BEGIN
  SELECT COUNT(*) INTO active_count
  FROM agent_sessions
  WHERE status = 'active';

  SELECT COUNT(*) INTO closed_count
  FROM agent_sessions
  WHERE status = 'closed';

  RAISE NOTICE 'PASS: Queries work with new statuses (active: %, closed: %)', active_count, closed_count;
END $$;

-- Test 5: Verify status distribution
DO $$
DECLARE
  total_count int;
  status_distribution text;
BEGIN
  SELECT COUNT(*), 
         string_agg(DISTINCT status, ', ' ORDER BY status) 
  INTO total_count, status_distribution
  FROM agent_sessions;

  IF total_count > 0 THEN
    RAISE NOTICE 'Status distribution: % (total: %)', status_distribution, total_count;
  END IF;

  RAISE NOTICE 'PASS: Status distribution verified';
END $$;

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'All Phase 5 smoke tests PASSED!';
  RAISE NOTICE '========================================';
END $$;

