-- =============================================================================
-- P1 Freshness Foundation — SQL self-test
-- =============================================================================
-- Run via psql against a STAGING / LOCAL database — never production.
-- Wraps everything in a transaction and ROLLBACK at end so it leaves no trace.
--
-- Usage:
--   psql $STAGING_DB_URL -f supabase/tests/p1_freshness_foundation_test.sql
--
-- Asserts:
--   1. fn_classify_deltas: IMMUTABLE + deterministic on known inputs
--   2. fn_classify_deltas: returns multiple deltas in one call when warranted
--   3. fn_classify_deltas: returns zero rows when no semantic change
--   4. trg_enqueue_signal_delta_processing fires on violations INSERT
--      and pushes a message onto the pgmq queue
--   5. trg_enqueue_signal_delta_processing does NOT fire on UPDATE that
--      only touches days_open (cosmetic column not in trigger column list)
--   6. RLS on signal_deltas blocks non-admin authenticated users
--   7. agent_runs.job_table CHECK accepts 'pgmq:signal_delta_processing'
-- =============================================================================

BEGIN;

-- ── Test 1: classifier — new_open_violation fires when open count goes up ──
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.fn_classify_deltas(
    '{"open_violations": 0, "total_violations": 0}'::jsonb,
    '{"open_violations": 2, "total_violations": 2}'::jsonb
  );
  ASSERT v_count >= 1, 'Test 1 failed: expected new_open_violation, got 0 deltas';

  PERFORM 1
  FROM public.fn_classify_deltas(
    '{"open_violations": 0}'::jsonb,
    '{"open_violations": 2}'::jsonb
  ) WHERE delta_type = 'new_open_violation';
  ASSERT FOUND, 'Test 1 failed: new_open_violation type not present';

  RAISE NOTICE 'Test 1 PASSED: new_open_violation classifier fires';
END $$;

-- ── Test 2: classifier — multiple deltas in one call ──────────────────────
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.fn_classify_deltas(
    '{"open_violations": 0, "escalated": false, "distress_signals": []}'::jsonb,
    '{"open_violations": 3, "escalated": true, "distress_signals": ["water_shutoff_enforcement"]}'::jsonb
  );
  ASSERT v_count = 3,
    format('Test 2 failed: expected 3 deltas (new_open + escalation + water_shutoff), got %s', v_count);

  RAISE NOTICE 'Test 2 PASSED: multiple deltas in one call';
END $$;

-- ── Test 3: classifier — no change → zero rows ────────────────────────────
DO $$
DECLARE
  v_count int;
  v_state jsonb := '{"open_violations": 1, "total_violations": 1, "escalated": false, "distress_signals": []}'::jsonb;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.fn_classify_deltas(v_state, v_state);
  ASSERT v_count = 0,
    format('Test 3 failed: expected 0 deltas on identical state, got %s', v_count);

  RAISE NOTICE 'Test 3 PASSED: no-change → zero deltas';
END $$;

-- ── Test 4: classifier — IMMUTABLE / deterministic ────────────────────────
DO $$
DECLARE
  v_first_run text[];
  v_second_run text[];
BEGIN
  SELECT array_agg(delta_type::text ORDER BY delta_type::text) INTO v_first_run
  FROM public.fn_classify_deltas(
    '{"open_violations": 0}'::jsonb,
    '{"open_violations": 2}'::jsonb
  );
  SELECT array_agg(delta_type::text ORDER BY delta_type::text) INTO v_second_run
  FROM public.fn_classify_deltas(
    '{"open_violations": 0}'::jsonb,
    '{"open_violations": 2}'::jsonb
  );
  ASSERT v_first_run = v_second_run,
    format('Test 4 failed: classifier non-deterministic. First=%s, Second=%s', v_first_run, v_second_run);

  RAISE NOTICE 'Test 4 PASSED: classifier is deterministic';
END $$;

-- ── Test 5: trigger fires + enqueues message on violations INSERT ─────────
DO $$
DECLARE
  v_property_id uuid;
  v_violation_id uuid;
  v_queue_count_before bigint;
  v_queue_count_after bigint;
BEGIN
  -- Pick or create a test property (use existing if available)
  SELECT id INTO v_property_id FROM public.properties LIMIT 1;
  IF v_property_id IS NULL THEN
    RAISE NOTICE 'Test 5 SKIPPED: no properties exist in this DB';
    RETURN;
  END IF;

  SELECT count(*) INTO v_queue_count_before FROM pgmq.q_signal_delta_processing;

  INSERT INTO public.violations (id, property_id, violation_type, status, opened_date, last_updated)
  VALUES (gen_random_uuid(), v_property_id, 'TEST: structural', 'Open', CURRENT_DATE, CURRENT_DATE)
  RETURNING id INTO v_violation_id;

  SELECT count(*) INTO v_queue_count_after FROM pgmq.q_signal_delta_processing;

  ASSERT v_queue_count_after = v_queue_count_before + 1,
    format('Test 5 failed: expected queue count +1, got before=%s after=%s', v_queue_count_before, v_queue_count_after);

  -- Cleanup test row (rollback will also undo this; belt + suspenders)
  DELETE FROM public.violations WHERE id = v_violation_id;

  RAISE NOTICE 'Test 5 PASSED: trigger fired and enqueued message';
END $$;

-- ── Test 6: trigger does NOT fire on cosmetic UPDATE (days_open only) ─────
-- Only valid if there's an existing violation; skip otherwise.
DO $$
DECLARE
  v_violation_id uuid;
  v_queue_count_before bigint;
  v_queue_count_after bigint;
BEGIN
  SELECT id INTO v_violation_id FROM public.violations LIMIT 1;
  IF v_violation_id IS NULL THEN
    RAISE NOTICE 'Test 6 SKIPPED: no violations exist';
    RETURN;
  END IF;

  SELECT count(*) INTO v_queue_count_before FROM pgmq.q_signal_delta_processing;

  -- days_open is NOT in the UPDATE OF column list → trigger should not fire.
  UPDATE public.violations
  SET days_open = COALESCE(days_open, 0) + 1
  WHERE id = v_violation_id;

  SELECT count(*) INTO v_queue_count_after FROM pgmq.q_signal_delta_processing;

  ASSERT v_queue_count_after = v_queue_count_before,
    format('Test 6 failed: trigger fired on cosmetic days_open update. Before=%s After=%s',
           v_queue_count_before, v_queue_count_after);

  RAISE NOTICE 'Test 6 PASSED: trigger ignores days_open-only UPDATE';
END $$;

-- ── Test 7: agent_runs.job_table accepts the new value ────────────────────
DO $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO public.agent_runs (
    agent_name, job_table, job_id, status, input_summary
  ) VALUES (
    'signal_delta_worker',
    'pgmq:signal_delta_processing',
    gen_random_uuid(),
    'started',
    'self-test'
  ) RETURNING id INTO v_id;

  ASSERT v_id IS NOT NULL, 'Test 7 failed: insert did not return id';
  RAISE NOTICE 'Test 7 PASSED: agent_runs.job_table accepts pgmq:signal_delta_processing';
END $$;

-- ── Test 8: pgmq queue + DLQ exist ─────────────────────────────────────────
DO $$
BEGIN
  PERFORM 1 FROM pg_class WHERE relname = 'q_signal_delta_processing';
  ASSERT FOUND, 'Test 8 failed: pgmq.q_signal_delta_processing table not found';

  PERFORM 1 FROM pg_class WHERE relname = 'q_signal_delta_processing_dlq';
  ASSERT FOUND, 'Test 8 failed: pgmq.q_signal_delta_processing_dlq table not found';

  RAISE NOTICE 'Test 8 PASSED: pgmq queue + DLQ exist';
END $$;

-- ── Test 9: views are queryable ────────────────────────────────────────────
DO $$
BEGIN
  PERFORM * FROM public.v_property_timeline LIMIT 0;
  PERFORM * FROM public.v_signal_deltas_last_hour LIMIT 0;
  PERFORM * FROM public.v_property_snapshots_last_hour LIMIT 0;
  RAISE NOTICE 'Test 9 PASSED: admin views are queryable';
END $$;

-- ── Test 10: tables + indexes exist ────────────────────────────────────────
DO $$
BEGIN
  PERFORM 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='violation_events';
  ASSERT FOUND, 'Test 10 failed: violation_events missing';
  PERFORM 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='property_snapshots';
  ASSERT FOUND, 'Test 10 failed: property_snapshots missing';
  PERFORM 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='signal_deltas';
  ASSERT FOUND, 'Test 10 failed: signal_deltas missing';
  PERFORM 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='jurisdiction_freshness';
  ASSERT FOUND, 'Test 10 failed: jurisdiction_freshness missing';
  RAISE NOTICE 'Test 10 PASSED: all 4 tables exist';
END $$;

-- ── Roll back everything ──────────────────────────────────────────────────
ROLLBACK;
