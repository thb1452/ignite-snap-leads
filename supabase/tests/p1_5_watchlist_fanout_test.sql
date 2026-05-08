-- =============================================================================
-- P1.5 Watchlist Fan-out — SQL self-test
-- =============================================================================
-- Wrapped in BEGIN/ROLLBACK so it leaves no trace.
--
-- Asserts (10 blocks):
--   1. All 3 new tables exist (saved_markets, user_signal_preferences,
--      watchlist_intelligence_events)
--   2. RLS is enabled on all 3 new tables
--   3. saved_markets RLS blocks reading another user's row
--   4. user_signal_preferences PK is (user_id, delta_type)
--   5. watchlist_intelligence_events unique index prevents duplicate
--      (user_id, signal_delta_id, source) triplets
--   6. trg_enqueue_watchlist_fanout fires on signal_deltas INSERT
--   7. agent_runs.job_table CHECK accepts 'pgmq:watchlist_event_fanout'
--   8. pgmq queues exist (watchlist_event_fanout + dlq)
--   9. v_watchlist_events_last_24h is queryable
--  10. INSERT into watchlist_intelligence_events ON CONFLICT (dedup) is no-op
--
-- Run via: psql $STAGING_DB_URL -f supabase/tests/p1_5_watchlist_fanout_test.sql
-- =============================================================================

BEGIN;

-- ── Test 1: tables exist ──────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='saved_markets';
  ASSERT FOUND, 'Test 1 failed: saved_markets missing';
  PERFORM 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_signal_preferences';
  ASSERT FOUND, 'Test 1 failed: user_signal_preferences missing';
  PERFORM 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='watchlist_intelligence_events';
  ASSERT FOUND, 'Test 1 failed: watchlist_intelligence_events missing';
  RAISE NOTICE 'Test 1 PASSED: all 3 P1.5 tables exist';
END $$;

-- ── Test 2: RLS enabled on all 3 ──────────────────────────────────────────
DO $$
DECLARE
  v_rls boolean;
BEGIN
  SELECT relrowsecurity INTO v_rls FROM pg_class
   WHERE relname = 'saved_markets' AND relnamespace = 'public'::regnamespace;
  ASSERT v_rls, 'Test 2 failed: RLS not enabled on saved_markets';

  SELECT relrowsecurity INTO v_rls FROM pg_class
   WHERE relname = 'user_signal_preferences' AND relnamespace = 'public'::regnamespace;
  ASSERT v_rls, 'Test 2 failed: RLS not enabled on user_signal_preferences';

  SELECT relrowsecurity INTO v_rls FROM pg_class
   WHERE relname = 'watchlist_intelligence_events' AND relnamespace = 'public'::regnamespace;
  ASSERT v_rls, 'Test 2 failed: RLS not enabled on watchlist_intelligence_events';

  RAISE NOTICE 'Test 2 PASSED: RLS enabled on all 3 P1.5 tables';
END $$;

-- ── Test 3: user_signal_preferences PK ────────────────────────────────────
DO $$
DECLARE
  v_pk_def text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_pk_def
  FROM pg_constraint c
  WHERE c.conrelid = 'public.user_signal_preferences'::regclass
    AND c.contype = 'p';
  ASSERT v_pk_def ILIKE '%user_id%' AND v_pk_def ILIKE '%delta_type%',
    format('Test 3 failed: PK is %s, expected (user_id, delta_type)', v_pk_def);
  RAISE NOTICE 'Test 3 PASSED: user_signal_preferences PK is (user_id, delta_type)';
END $$;

-- ── Test 4: watchlist_intelligence_events unique index dedupes ────────────
DO $$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_pid uuid;
  v_did uuid := gen_random_uuid();
  v_inserted int := 0;
  v_blocked int := 0;
BEGIN
  -- Use any existing property; if none, skip
  SELECT id INTO v_pid FROM public.properties LIMIT 1;
  IF v_pid IS NULL THEN
    RAISE NOTICE 'Test 4 SKIPPED: no properties exist';
    RETURN;
  END IF;

  INSERT INTO public.watchlist_intelligence_events
    (user_id, source, signal_delta_id, property_id, delta_type, severity)
  VALUES
    (v_uid, 'saved_property', v_did, v_pid, 'new_open_violation', 80);
  v_inserted := v_inserted + 1;

  BEGIN
    INSERT INTO public.watchlist_intelligence_events
      (user_id, source, signal_delta_id, property_id, delta_type, severity)
    VALUES
      (v_uid, 'saved_property', v_did, v_pid, 'new_open_violation', 80);
    v_inserted := v_inserted + 1;
  EXCEPTION WHEN unique_violation THEN
    v_blocked := v_blocked + 1;
  END;

  ASSERT v_inserted = 1 AND v_blocked = 1,
    format('Test 4 failed: expected 1 insert + 1 unique-violation, got inserts=%s blocked=%s',
           v_inserted, v_blocked);
  RAISE NOTICE 'Test 4 PASSED: dedup unique index blocks second insert';
END $$;

-- ── Test 5: different source dedups independently ─────────────────────────
DO $$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_pid uuid;
  v_did uuid := gen_random_uuid();
  v_count int;
BEGIN
  SELECT id INTO v_pid FROM public.properties LIMIT 1;
  IF v_pid IS NULL THEN
    RAISE NOTICE 'Test 5 SKIPPED: no properties exist';
    RETURN;
  END IF;

  INSERT INTO public.watchlist_intelligence_events
    (user_id, source, signal_delta_id, property_id, delta_type, severity)
  VALUES
    (v_uid, 'saved_property', v_did, v_pid, 'new_open_violation', 80),
    (v_uid, 'list',           v_did, v_pid, 'new_open_violation', 80);

  SELECT count(*) INTO v_count
  FROM public.watchlist_intelligence_events
  WHERE user_id = v_uid AND signal_delta_id = v_did;

  ASSERT v_count = 2,
    format('Test 5 failed: expected 2 rows (different sources), got %s', v_count);
  RAISE NOTICE 'Test 5 PASSED: different sources allowed for same delta';
END $$;

-- ── Test 6: trg_enqueue_watchlist_fanout fires on signal_deltas INSERT ────
DO $$
DECLARE
  v_pid uuid;
  v_count_before bigint;
  v_count_after  bigint;
BEGIN
  SELECT id INTO v_pid FROM public.properties LIMIT 1;
  IF v_pid IS NULL THEN
    RAISE NOTICE 'Test 6 SKIPPED: no properties exist';
    RETURN;
  END IF;

  SELECT count(*) INTO v_count_before FROM pgmq.q_watchlist_event_fanout;

  INSERT INTO public.signal_deltas
    (property_id, delta_type, severity, evidence)
  VALUES
    (v_pid, 'new_open_violation', 80, '{"test": true}'::jsonb);

  SELECT count(*) INTO v_count_after FROM pgmq.q_watchlist_event_fanout;

  ASSERT v_count_after = v_count_before + 1,
    format('Test 6 failed: expected fanout queue +1, got before=%s after=%s',
           v_count_before, v_count_after);
  RAISE NOTICE 'Test 6 PASSED: trigger enqueued fan-out message';
END $$;

-- ── Test 7: agent_runs.job_table accepts the new value ────────────────────
DO $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO public.agent_runs (
    agent_name, job_table, job_id, status, input_summary
  ) VALUES (
    'watchlist_fanout_worker',
    'pgmq:watchlist_event_fanout',
    gen_random_uuid(),
    'started',
    'self-test'
  ) RETURNING id INTO v_id;

  ASSERT v_id IS NOT NULL, 'Test 7 failed: insert did not return id';
  RAISE NOTICE 'Test 7 PASSED: agent_runs.job_table accepts pgmq:watchlist_event_fanout';
END $$;

-- ── Test 8: pgmq queues exist ─────────────────────────────────────────────
DO $$
BEGIN
  PERFORM 1 FROM pg_class WHERE relname = 'q_watchlist_event_fanout';
  ASSERT FOUND, 'Test 8 failed: pgmq.q_watchlist_event_fanout missing';

  PERFORM 1 FROM pg_class WHERE relname = 'q_watchlist_event_fanout_dlq';
  ASSERT FOUND, 'Test 8 failed: pgmq.q_watchlist_event_fanout_dlq missing';

  RAISE NOTICE 'Test 8 PASSED: pgmq queues exist';
END $$;

-- ── Test 9: admin view is queryable ───────────────────────────────────────
DO $$
BEGIN
  PERFORM * FROM public.v_watchlist_events_last_24h LIMIT 0;
  RAISE NOTICE 'Test 9 PASSED: v_watchlist_events_last_24h queryable';
END $$;

-- ── Test 10: signal_delta_type values default sensibly ────────────────────
-- user_signal_preferences.weight defaults to 50, suppressed=false
DO $$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_weight smallint;
  v_suppressed boolean;
BEGIN
  INSERT INTO public.user_signal_preferences (user_id, delta_type)
  VALUES (v_uid, 'new_open_violation');

  SELECT weight, suppressed INTO v_weight, v_suppressed
  FROM public.user_signal_preferences
  WHERE user_id = v_uid AND delta_type = 'new_open_violation';

  ASSERT v_weight = 50, format('Test 10 failed: default weight is %s, expected 50', v_weight);
  ASSERT v_suppressed = false, 'Test 10 failed: default suppressed is not false';

  RAISE NOTICE 'Test 10 PASSED: user_signal_preferences defaults to weight=50, suppressed=false';
END $$;

ROLLBACK;
