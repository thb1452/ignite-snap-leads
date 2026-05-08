-- =============================================================================
-- P1.6c mark-seen RPC — SQL self-test
-- =============================================================================
-- Wrapped in BEGIN/ROLLBACK; leaves no trace.
--
-- Tests are at the function-body level (we set GUC request.jwt.claims to
-- impersonate a user — same pattern Supabase uses for RLS testing).
--
-- Asserts (5 blocks):
--   1. function exists and is callable
--   2. returns the count of rows it updated
--   3. only marks events for the calling user_id (no cross-user leakage)
--   4. does NOT touch dismissed_at (only sets seen_at)
--   5. is idempotent — second call returns 0 because everything is already seen
--
-- Run via: psql $STAGING_DB_URL -f supabase/tests/p1_6c_mark_seen_test.sql
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_pid    uuid;
  v_returned int;
  v_seen_count int;
  v_dismissed_count int;
BEGIN
  -- Need a property for the FK-ish soft reference; skip if none exist.
  SELECT id INTO v_pid FROM public.properties LIMIT 1;
  IF v_pid IS NULL THEN
    RAISE NOTICE 'Tests SKIPPED: no properties exist';
    RETURN;
  END IF;

  -- ── Seed test data ──────────────────────────────────────────────────────
  INSERT INTO public.watchlist_intelligence_events
    (user_id, source, signal_delta_id, property_id, delta_type, severity, seen_at, dismissed_at)
  VALUES
    -- user_a: 3 unread + 1 already-seen + 1 dismissed
    (v_user_a, 'saved_property', gen_random_uuid(), v_pid, 'water_shutoff_added',     90, NULL,    NULL),
    (v_user_a, 'saved_property', gen_random_uuid(), v_pid, 'enforcement_escalation',  85, NULL,    NULL),
    (v_user_a, 'list',           gen_random_uuid(), v_pid, 'new_open_violation',      60, NULL,    NULL),
    (v_user_a, 'saved_property', gen_random_uuid(), v_pid, 'closed_after_long_open',  50, now(),   NULL),  -- already seen
    (v_user_a, 'saved_property', gen_random_uuid(), v_pid, 'extended_enforcement_milestone', 70, NULL, now()),  -- dismissed
    -- user_b: 2 unread (must NOT be touched when user_a marks)
    (v_user_b, 'saved_property', gen_random_uuid(), v_pid, 'water_shutoff_added',     90, NULL, NULL),
    (v_user_b, 'list',           gen_random_uuid(), v_pid, 'new_open_violation',      60, NULL, NULL);

  -- ── Test 1: function exists and is callable ────────────────────────────
  PERFORM 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_mark_my_watchlist_events_seen';
  ASSERT FOUND, 'Test 1 failed: fn_mark_my_watchlist_events_seen not present';
  RAISE NOTICE 'Test 1 PASSED: function exists';

  -- ── Test 2: impersonate user_a; returns 3 ──────────────────────────────
  -- Set the auth.uid() context using the supabase JWT claims GUC.
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_a::text)::text,
    true  -- local to this transaction
  );

  SELECT public.fn_mark_my_watchlist_events_seen() INTO v_returned;
  ASSERT v_returned = 3,
    format('Test 2 failed: expected 3 rows updated for user_a, got %s', v_returned);
  RAISE NOTICE 'Test 2 PASSED: marked 3 unread/undismissed events';

  -- ── Test 3: user_b's events untouched ──────────────────────────────────
  SELECT count(*) INTO v_seen_count
  FROM public.watchlist_intelligence_events
  WHERE user_id = v_user_b AND seen_at IS NOT NULL;
  ASSERT v_seen_count = 0,
    format('Test 3 failed: user_b had %s events marked seen — should be 0', v_seen_count);
  RAISE NOTICE 'Test 3 PASSED: user_b events untouched';

  -- ── Test 4: dismissed_at not touched ──────────────────────────────────
  SELECT count(*) INTO v_dismissed_count
  FROM public.watchlist_intelligence_events
  WHERE user_id = v_user_a AND dismissed_at IS NOT NULL AND seen_at IS NOT NULL;
  -- We expect the originally-dismissed row to STILL have dismissed_at,
  -- AND it should NOT have been marked seen by the function (since seen_at
  -- IS NULL was a precondition). Either way, we assert the dismissed flag is preserved.
  PERFORM 1 FROM public.watchlist_intelligence_events
    WHERE user_id = v_user_a AND dismissed_at IS NOT NULL;
  ASSERT FOUND, 'Test 4 failed: dismissed_at was wiped';
  RAISE NOTICE 'Test 4 PASSED: dismissed_at preserved';

  -- ── Test 5: idempotent — second call returns 0 ────────────────────────
  SELECT public.fn_mark_my_watchlist_events_seen() INTO v_returned;
  ASSERT v_returned = 0,
    format('Test 5 failed: second call should return 0 (all seen), got %s', v_returned);
  RAISE NOTICE 'Test 5 PASSED: function is idempotent';

  -- Bonus: confirm user_a's already-seen row's seen_at was NOT updated
  -- (we should not overwrite the original timestamp).
  -- Hard to assert this exactly without storing it pre-call; tested
  -- functionally by the WHERE clause "seen_at IS NULL".
END $$;

ROLLBACK;
