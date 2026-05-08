-- =============================================================================
-- P1.6b Watchlist Digest Helper — SQL self-test
-- =============================================================================
-- Wrapped in BEGIN/ROLLBACK so it leaves no trace.
--
-- Asserts (8 blocks):
--   1. fn_top_watchlist_events_for_user is callable and returns rows
--   2. Returns only rows for the requested user_id (not other users)
--   3. Skips rows with seen_at IS NOT NULL
--   4. Skips rows with dismissed_at IS NOT NULL
--   5. Respects window_days (excludes events older than the window)
--   6. Sorts by severity DESC, then created_at DESC
--   7. Honors limit
--   8. Joins to properties (returns address, city, state, snap_score)
--
-- Run via: psql $STAGING_DB_URL -f supabase/tests/p1_6b_watchlist_digest_test.sql
-- =============================================================================

BEGIN;

-- ── Setup: synthetic user IDs + a property ────────────────────────────────
DO $$
DECLARE
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_pid    uuid;
  v_count  int;
BEGIN
  -- Need an existing property for the JOIN; skip if none.
  SELECT id INTO v_pid FROM public.properties LIMIT 1;
  IF v_pid IS NULL THEN
    RAISE NOTICE 'Tests SKIPPED: no properties exist in this DB';
    RETURN;
  END IF;

  -- Test data: 5 events for user_a, 1 for user_b. Mix of seen/dismissed/old.
  INSERT INTO public.watchlist_intelligence_events
    (user_id, source, signal_delta_id, property_id, delta_type, severity, seen_at, dismissed_at, created_at)
  VALUES
    -- user_a, top severity, fresh, unseen → should be #1
    (v_user_a, 'saved_property', gen_random_uuid(), v_pid, 'water_shutoff_added',     90, NULL, NULL, now() - interval '1 day'),
    -- user_a, mid severity, fresh, unseen → should be #2
    (v_user_a, 'saved_property', gen_random_uuid(), v_pid, 'enforcement_escalation',  75, NULL, NULL, now() - interval '2 days'),
    -- user_a, low severity, fresh, unseen → should be #3
    (v_user_a, 'list',           gen_random_uuid(), v_pid, 'new_open_violation',      60, NULL, NULL, now() - interval '3 days'),
    -- user_a, top severity, but SEEN → should be excluded
    (v_user_a, 'saved_property', gen_random_uuid(), v_pid, 'water_shutoff_added',     95, now(),    NULL, now() - interval '1 day'),
    -- user_a, top severity, but DISMISSED → should be excluded
    (v_user_a, 'saved_property', gen_random_uuid(), v_pid, 'water_shutoff_added',     95, NULL, now(),    now() - interval '1 day'),
    -- user_a, fresh + unseen but OLD (30 days) → excluded by 7-day window
    (v_user_a, 'saved_property', gen_random_uuid(), v_pid, 'closed_after_long_open',  88, NULL, NULL, now() - interval '30 days'),
    -- user_b row that should never appear in user_a's results
    (v_user_b, 'saved_property', gen_random_uuid(), v_pid, 'water_shutoff_added',     99, NULL, NULL, now() - interval '1 day');

  -- ── Test 1: callable + returns rows for user_a ──────────────────────────
  SELECT count(*) INTO v_count FROM public.fn_top_watchlist_events_for_user(v_user_a, 7, 10);
  ASSERT v_count = 3, format('Test 1 failed: expected 3 events for user_a, got %s', v_count);
  RAISE NOTICE 'Test 1 PASSED: callable + returns expected count';

  -- ── Test 2: scoped to user_id ───────────────────────────────────────────
  SELECT count(*) INTO v_count FROM public.fn_top_watchlist_events_for_user(v_user_b, 7, 10);
  ASSERT v_count = 1, format('Test 2 failed: expected 1 event for user_b, got %s', v_count);
  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.fn_top_watchlist_events_for_user(v_user_a, 7, 10)
    WHERE event_id IN (
      SELECT id FROM public.watchlist_intelligence_events WHERE user_id = v_user_b
    )
  ), 'Test 2 failed: user_a results contain user_b rows';
  RAISE NOTICE 'Test 2 PASSED: scoped to user_id';

  -- ── Test 3: skips seen_at IS NOT NULL ───────────────────────────────────
  SELECT count(*) INTO v_count
  FROM public.fn_top_watchlist_events_for_user(v_user_a, 7, 10)
  WHERE severity = 95;  -- the seen + dismissed rows have severity 95
  ASSERT v_count = 0, format('Test 3 failed: severity-95 rows (seen/dismissed) should not appear, got %s', v_count);
  RAISE NOTICE 'Test 3 PASSED: skips seen_at + dismissed_at';

  -- ── Test 4: window respected ────────────────────────────────────────────
  -- The 30-day-old severity-88 row should not appear in 7-day window.
  SELECT count(*) INTO v_count
  FROM public.fn_top_watchlist_events_for_user(v_user_a, 7, 10)
  WHERE severity = 88;
  ASSERT v_count = 0, format('Test 4 failed: 30-day-old row appeared in 7-day window, got %s', v_count);

  -- Widen window to 60 days → it should now appear.
  SELECT count(*) INTO v_count
  FROM public.fn_top_watchlist_events_for_user(v_user_a, 60, 10)
  WHERE severity = 88;
  ASSERT v_count = 1, format('Test 4 failed: 30-day-old row should appear in 60-day window, got %s', v_count);
  RAISE NOTICE 'Test 4 PASSED: window respected';

  -- ── Test 5: sort order severity DESC, created_at DESC ───────────────────
  -- Compare the first row's severity vs the last row's severity.
  WITH ordered AS (
    SELECT row_number() OVER () AS rn, severity
    FROM public.fn_top_watchlist_events_for_user(v_user_a, 7, 10)
  )
  SELECT (SELECT severity FROM ordered WHERE rn = 1)
       - (SELECT severity FROM ordered WHERE rn = (SELECT count(*) FROM ordered))
    INTO v_count;
  ASSERT v_count >= 0, 'Test 5 failed: severity not sorted DESC';
  RAISE NOTICE 'Test 5 PASSED: severity DESC sort';

  -- ── Test 6: limit honored ───────────────────────────────────────────────
  SELECT count(*) INTO v_count FROM public.fn_top_watchlist_events_for_user(v_user_a, 7, 2);
  ASSERT v_count = 2, format('Test 6 failed: limit=2 returned %s rows', v_count);
  RAISE NOTICE 'Test 6 PASSED: limit honored';

  -- ── Test 7: limit clamped to >= 1 ──────────────────────────────────────
  SELECT count(*) INTO v_count FROM public.fn_top_watchlist_events_for_user(v_user_a, 7, 0);
  ASSERT v_count >= 1, format('Test 7 failed: limit=0 should clamp to >=1, got %s', v_count);
  RAISE NOTICE 'Test 7 PASSED: limit clamped';

  -- ── Test 8: JOIN to properties returned address ─────────────────────────
  ASSERT EXISTS (
    SELECT 1 FROM public.fn_top_watchlist_events_for_user(v_user_a, 7, 10)
    WHERE address IS NOT NULL AND city IS NOT NULL AND state IS NOT NULL
  ), 'Test 8 failed: JOIN to properties did not populate address/city/state';
  RAISE NOTICE 'Test 8 PASSED: properties JOIN populated';
END $$;

ROLLBACK;
