-- =============================================================================
-- P1.6a Matcher Hardening — SQL self-test (issue #165)
-- =============================================================================
-- Wrapped in BEGIN/ROLLBACK; leaves no trace.
--
-- Asserts the 3 hardening fixes from 20260509000000_p1_6a_matcher_hardening.sql:
--   1. Function volatility is now STABLE (was IMMUTABLE)
--   2. Malformed `lastSeenDays` does NOT throw — it's treated as "don't
--      constrain" so a single bad saved_market filter cannot poison fan-out
--   3. Malformed `snapScoreRange` values do NOT throw
--   4. {} filter + NULL property returns true (empty effective filter
--      short-circuit fires before the null-property guard)
--   5. Existing 12 tests from the original test file still pass (regression
--      sanity — duplicated here for stand-alone execution)
--
-- Run via: psql $STAGING_DB_URL -f supabase/tests/p1_6a_matcher_hardening_test.sql
-- =============================================================================

BEGIN;

-- ── Test 1: function is STABLE ────────────────────────────────────────────
DO $$
DECLARE
  v_volatility text;
BEGIN
  SELECT CASE p.provolatile
           WHEN 'i' THEN 'IMMUTABLE'
           WHEN 's' THEN 'STABLE'
           WHEN 'v' THEN 'VOLATILE'
         END
    INTO v_volatility
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'fn_property_matches_filter'
    AND pg_get_function_arguments(p.oid) = 'p_filter jsonb, p_property_state jsonb';

  ASSERT v_volatility = 'STABLE',
    format('Test 1 failed: expected STABLE, got %s', v_volatility);
  RAISE NOTICE 'Test 1 PASSED: fn_property_matches_filter is STABLE';
END $$;

-- ── Test 2: malformed lastSeenDays does not throw ─────────────────────────
DO $$
DECLARE
  v_result boolean;
BEGIN
  -- Without hardening, this would raise invalid_text_representation.
  -- With hardening, the bad value is treated as "don't constrain"
  -- so the filter has no active constraints → matches everything.
  v_result := public.fn_property_matches_filter(
    '{"lastSeenDays":"not-a-number"}'::jsonb,
    '{"state":"IN","snap_score":50}'::jsonb
  );
  ASSERT v_result = true,
    format('Test 2 failed: malformed lastSeenDays should not constrain, got %s', v_result);
  RAISE NOTICE 'Test 2 PASSED: malformed lastSeenDays is non-fatal';
END $$;

-- ── Test 3: malformed snapScoreRange does not throw ───────────────────────
DO $$
DECLARE
  v_result boolean;
BEGIN
  v_result := public.fn_property_matches_filter(
    '{"snapScoreRange":["abc","def"]}'::jsonb,
    '{"state":"IN","snap_score":50}'::jsonb
  );
  ASSERT v_result = true,
    format('Test 3 failed: malformed snapScoreRange should not constrain, got %s', v_result);

  -- Mixed: only the bad bound is dropped; the good one still applies.
  v_result := public.fn_property_matches_filter(
    '{"snapScoreRange":[60,"oops"]}'::jsonb,
    '{"snap_score":75}'::jsonb
  );
  ASSERT v_result = true,
    format('Test 3 failed: mixed-bad snapScoreRange should still apply min, got %s', v_result);

  v_result := public.fn_property_matches_filter(
    '{"snapScoreRange":[60,"oops"]}'::jsonb,
    '{"snap_score":40}'::jsonb
  );
  ASSERT v_result = false,
    format('Test 3 failed: snap_score 40 below min 60 should reject, got %s', v_result);

  RAISE NOTICE 'Test 3 PASSED: malformed snapScoreRange is non-fatal';
END $$;

-- ── Test 4: {} filter + NULL property returns true ────────────────────────
DO $$
BEGIN
  ASSERT public.fn_property_matches_filter('{}'::jsonb, NULL) = true,
    'Test 4 failed: empty filter + NULL property should match';
  ASSERT public.fn_property_matches_filter('{}'::jsonb, '{}'::jsonb) = true,
    'Test 4 failed: empty filter + empty property should match';
  -- Filter with all-empty values (post-parse) also short-circuits
  ASSERT public.fn_property_matches_filter(
    '{"state":"","cities":[],"openViolationsOnly":false}'::jsonb,
    NULL
  ) = true,
    'Test 4 failed: empty effective filter + NULL property should match';
  RAISE NOTICE 'Test 4 PASSED: empty filter short-circuits before null-property guard';
END $$;

-- ── Test 5: real-active filter + NULL property still rejects ──────────────
DO $$
BEGIN
  -- An active constraint cannot be matched against a null property.
  ASSERT public.fn_property_matches_filter(
    '{"state":"IN"}'::jsonb,
    NULL
  ) = false,
    'Test 5 failed: active filter + NULL property should reject';
  RAISE NOTICE 'Test 5 PASSED: active filter + NULL property rejects';
END $$;

-- ── Test 6: regression — original 12 tests behavior preserved ─────────────
DO $$
BEGIN
  -- state filter, case-insensitive
  ASSERT public.fn_property_matches_filter('{"state":"in"}'::jsonb, '{"state":"IN"}'::jsonb) = true;
  ASSERT public.fn_property_matches_filter('{"state":"OH"}'::jsonb, '{"state":"IN"}'::jsonb) = false;

  -- snapScoreRange (well-formed)
  ASSERT public.fn_property_matches_filter(
    '{"snapScoreRange":[60,90]}'::jsonb, '{"snap_score":75}'::jsonb) = true;
  ASSERT public.fn_property_matches_filter(
    '{"snapScoreRange":[60,90]}'::jsonb, '{"snap_score":50}'::jsonb) = false;

  -- openViolationsOnly
  ASSERT public.fn_property_matches_filter(
    '{"openViolationsOnly":true}'::jsonb, '{"open_violations":2}'::jsonb) = true;
  ASSERT public.fn_property_matches_filter(
    '{"openViolationsOnly":true}'::jsonb, '{"open_violations":0}'::jsonb) = false;

  -- violationType membership
  ASSERT public.fn_property_matches_filter(
    '{"violationType":"structural"}'::jsonb,
    '{"violation_types":["structural","fire"]}'::jsonb) = true;
  ASSERT public.fn_property_matches_filter(
    '{"violationType":"electrical"}'::jsonb,
    '{"violation_types":["structural","fire"]}'::jsonb) = false;

  RAISE NOTICE 'Test 6 PASSED: original behavior preserved (regression)';
END $$;

-- ── Test 7: fn_find_saved_market_matches still works after hardening ──────
DO $$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_match_count int;
BEGIN
  -- Plant a market with a malformed filter — should not poison the RPC
  INSERT INTO public.saved_markets (user_id, name, filter_payload, notify_on)
  VALUES (
    v_uid,
    'Has malformed lastSeenDays',
    '{"state":"IN","lastSeenDays":"not-a-number"}'::jsonb,
    '[]'::jsonb
  );

  -- The matcher should return true for this market (malformed key dropped, state still applies)
  SELECT count(*) INTO v_match_count
  FROM public.fn_find_saved_market_matches(
    '{"state":"IN","city":"Indianapolis"}'::jsonb,
    'new_open_violation'
  )
  WHERE user_id = v_uid;
  ASSERT v_match_count = 1,
    format('Test 7 failed: malformed filter should not poison RPC, got %s matches', v_match_count);
  RAISE NOTICE 'Test 7 PASSED: malformed saved_market filter does not poison fan-out';
END $$;

ROLLBACK;
