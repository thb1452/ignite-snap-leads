-- =============================================================================
-- P1.6a Saved-Market Filter Matcher — SQL self-test
-- =============================================================================
-- Wrapped in BEGIN/ROLLBACK so it leaves no trace.
--
-- Asserts (12 blocks):
--   1. fn_property_matches_filter: empty filter matches anything
--   2. fn_property_matches_filter: state filter (case-insensitive)
--   3. fn_property_matches_filter: state mismatch fails
--   4. fn_property_matches_filter: cities array (any-of, case-insensitive)
--   5. fn_property_matches_filter: snapScoreRange [min, max]
--   6. fn_property_matches_filter: openViolationsOnly
--   7. fn_property_matches_filter: violationType membership
--   8. fn_property_matches_filter: lastSeenDays window
--   9. fn_property_matches_filter: IMMUTABLE / deterministic
--  10. fn_find_saved_market_matches: matches markets whose filter accepts the property
--  11. fn_find_saved_market_matches: skips markets with digest_cadence='off'
--  12. fn_find_saved_market_matches: skips markets whose notify_on excludes delta_type
--
-- Run via: psql $STAGING_DB_URL -f supabase/tests/p1_6a_saved_market_matcher_test.sql
-- =============================================================================

BEGIN;

-- ── Test 1: empty filter matches everything ────────────────────────────────
DO $$
BEGIN
  ASSERT public.fn_property_matches_filter('{}'::jsonb,
    '{"state":"IN","city":"Indianapolis","snap_score":50}'::jsonb) = true,
    'Test 1 failed: empty filter should match';
  ASSERT public.fn_property_matches_filter(NULL,
    '{"state":"IN"}'::jsonb) = true,
    'Test 1 failed: null filter should match';
  RAISE NOTICE 'Test 1 PASSED: empty/null filter matches';
END $$;

-- ── Test 2: state filter, case-insensitive ─────────────────────────────────
DO $$
BEGIN
  ASSERT public.fn_property_matches_filter(
    '{"state":"in"}'::jsonb,
    '{"state":"IN"}'::jsonb) = true,
    'Test 2 failed: lowercase filter state should match uppercase property state';
  ASSERT public.fn_property_matches_filter(
    '{"state":"IN"}'::jsonb,
    '{"state":"in"}'::jsonb) = true,
    'Test 2 failed: case-insensitive both ways';
  RAISE NOTICE 'Test 2 PASSED: state filter is case-insensitive';
END $$;

-- ── Test 3: state mismatch fails ──────────────────────────────────────────
DO $$
BEGIN
  ASSERT public.fn_property_matches_filter(
    '{"state":"OH"}'::jsonb,
    '{"state":"IN"}'::jsonb) = false,
    'Test 3 failed: OH filter should reject IN property';
  ASSERT public.fn_property_matches_filter(
    '{"state":"IN"}'::jsonb,
    '{}'::jsonb) = false,
    'Test 3 failed: filter requires state but property has none';
  RAISE NOTICE 'Test 3 PASSED: state mismatch rejected';
END $$;

-- ── Test 4: cities filter (any-of, case-insensitive) ──────────────────────
DO $$
BEGIN
  ASSERT public.fn_property_matches_filter(
    '{"cities":["Indianapolis","Cleveland"]}'::jsonb,
    '{"city":"INDIANAPOLIS"}'::jsonb) = true,
    'Test 4 failed: indianapolis case-insensitive city match';
  ASSERT public.fn_property_matches_filter(
    '{"cities":["Cleveland","Cincinnati"]}'::jsonb,
    '{"city":"Indianapolis"}'::jsonb) = false,
    'Test 4 failed: city not in array';
  ASSERT public.fn_property_matches_filter(
    '{"cities":[]}'::jsonb,
    '{"city":"Indianapolis"}'::jsonb) = true,
    'Test 4 failed: empty cities array should not constrain';
  RAISE NOTICE 'Test 4 PASSED: cities filter (any-of, case-insensitive)';
END $$;

-- ── Test 5: snapScoreRange ────────────────────────────────────────────────
DO $$
BEGIN
  ASSERT public.fn_property_matches_filter(
    '{"snapScoreRange":[60,90]}'::jsonb,
    '{"snap_score":75}'::jsonb) = true,
    'Test 5 failed: 75 is in [60,90]';
  ASSERT public.fn_property_matches_filter(
    '{"snapScoreRange":[60,90]}'::jsonb,
    '{"snap_score":50}'::jsonb) = false,
    'Test 5 failed: 50 below 60';
  ASSERT public.fn_property_matches_filter(
    '{"snapScoreRange":[60,90]}'::jsonb,
    '{"snap_score":95}'::jsonb) = false,
    'Test 5 failed: 95 above 90';
  RAISE NOTICE 'Test 5 PASSED: snapScoreRange enforced';
END $$;

-- ── Test 6: openViolationsOnly ────────────────────────────────────────────
DO $$
BEGIN
  ASSERT public.fn_property_matches_filter(
    '{"openViolationsOnly":true}'::jsonb,
    '{"open_violations":2}'::jsonb) = true,
    'Test 6 failed: open=2 should match';
  ASSERT public.fn_property_matches_filter(
    '{"openViolationsOnly":true}'::jsonb,
    '{"open_violations":0}'::jsonb) = false,
    'Test 6 failed: open=0 should fail';
  ASSERT public.fn_property_matches_filter(
    '{"openViolationsOnly":false}'::jsonb,
    '{"open_violations":0}'::jsonb) = true,
    'Test 6 failed: openViolationsOnly=false should not constrain';
  RAISE NOTICE 'Test 6 PASSED: openViolationsOnly enforced';
END $$;

-- ── Test 7: violationType membership ──────────────────────────────────────
DO $$
BEGIN
  ASSERT public.fn_property_matches_filter(
    '{"violationType":"structural"}'::jsonb,
    '{"violation_types":["structural","fire"]}'::jsonb) = true,
    'Test 7 failed: structural in violation_types';
  ASSERT public.fn_property_matches_filter(
    '{"violationType":"electrical"}'::jsonb,
    '{"violation_types":["structural","fire"]}'::jsonb) = false,
    'Test 7 failed: electrical not in violation_types';
  ASSERT public.fn_property_matches_filter(
    '{"violationType":"structural"}'::jsonb,
    '{"violation_types":[]}'::jsonb) = false,
    'Test 7 failed: empty violation_types should not match';
  RAISE NOTICE 'Test 7 PASSED: violationType membership enforced';
END $$;

-- ── Test 8: lastSeenDays window ───────────────────────────────────────────
DO $$
DECLARE
  v_recent text := (CURRENT_DATE - 3)::text;
  v_old    text := (CURRENT_DATE - 60)::text;
BEGIN
  ASSERT public.fn_property_matches_filter(
    '{"lastSeenDays":7}'::jsonb,
    jsonb_build_object('newest_violation_date', v_recent)) = true,
    'Test 8 failed: 3-day-old should pass 7-day window';
  ASSERT public.fn_property_matches_filter(
    '{"lastSeenDays":7}'::jsonb,
    jsonb_build_object('newest_violation_date', v_old)) = false,
    'Test 8 failed: 60-day-old should fail 7-day window';
  ASSERT public.fn_property_matches_filter(
    '{"lastSeenDays":7}'::jsonb,
    '{}'::jsonb) = false,
    'Test 8 failed: missing newest_violation_date should fail when window required';
  RAISE NOTICE 'Test 8 PASSED: lastSeenDays window enforced';
END $$;

-- ── Test 9: deterministic / IMMUTABLE ─────────────────────────────────────
DO $$
DECLARE
  v_a boolean;
  v_b boolean;
BEGIN
  v_a := public.fn_property_matches_filter(
    '{"state":"IN","snapScoreRange":[60,90],"openViolationsOnly":true}'::jsonb,
    '{"state":"IN","snap_score":78,"open_violations":2}'::jsonb);
  v_b := public.fn_property_matches_filter(
    '{"state":"IN","snapScoreRange":[60,90],"openViolationsOnly":true}'::jsonb,
    '{"state":"IN","snap_score":78,"open_violations":2}'::jsonb);
  ASSERT v_a = v_b, format('Test 9 failed: matcher non-deterministic: %s vs %s', v_a, v_b);
  RAISE NOTICE 'Test 9 PASSED: matcher is deterministic';
END $$;

-- ── Test 10: fn_find_saved_market_matches positive case ──────────────────
DO $$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_match_count int;
BEGIN
  INSERT INTO public.saved_markets (user_id, name, filter_payload, notify_on)
  VALUES (
    v_uid,
    'Indianapolis SnapScore 60+',
    '{"state":"IN","cities":["Indianapolis"],"snapScoreRange":[60,100]}'::jsonb,
    '[]'::jsonb
  );

  SELECT count(*) INTO v_match_count
  FROM public.fn_find_saved_market_matches(
    '{"state":"IN","city":"Indianapolis","snap_score":78,"open_violations":2}'::jsonb,
    'new_open_violation'
  )
  WHERE user_id = v_uid;

  ASSERT v_match_count = 1,
    format('Test 10 failed: expected 1 market match, got %s', v_match_count);
  RAISE NOTICE 'Test 10 PASSED: fn_find_saved_market_matches matches positive case';
END $$;

-- ── Test 11: fn_find_saved_market_matches skips digest_cadence='off' ──────
DO $$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_match_count int;
BEGIN
  INSERT INTO public.saved_markets (user_id, name, filter_payload, notify_on, digest_cadence)
  VALUES (
    v_uid,
    'Snoozed market',
    '{"state":"IN"}'::jsonb,
    '[]'::jsonb,
    'off'
  );

  SELECT count(*) INTO v_match_count
  FROM public.fn_find_saved_market_matches(
    '{"state":"IN","city":"Indianapolis"}'::jsonb,
    'new_open_violation'
  )
  WHERE user_id = v_uid;

  ASSERT v_match_count = 0,
    format('Test 11 failed: digest_cadence=off market should NOT match, got %s rows', v_match_count);
  RAISE NOTICE 'Test 11 PASSED: digest_cadence=off skipped';
END $$;

-- ── Test 12: fn_find_saved_market_matches respects notify_on whitelist ───
DO $$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_match_count int;
BEGIN
  -- Market only wants water_shutoff_added events
  INSERT INTO public.saved_markets (user_id, name, filter_payload, notify_on)
  VALUES (
    v_uid,
    'Water-shutoff only',
    '{"state":"IN"}'::jsonb,
    '["water_shutoff_added"]'::jsonb
  );

  -- Querying for new_open_violation should return zero
  SELECT count(*) INTO v_match_count
  FROM public.fn_find_saved_market_matches(
    '{"state":"IN","city":"Indianapolis"}'::jsonb,
    'new_open_violation'
  )
  WHERE user_id = v_uid;
  ASSERT v_match_count = 0,
    format('Test 12 failed: notify_on=[water_shutoff_added] should NOT match new_open_violation, got %s', v_match_count);

  -- Querying for water_shutoff_added should match
  SELECT count(*) INTO v_match_count
  FROM public.fn_find_saved_market_matches(
    '{"state":"IN","city":"Indianapolis"}'::jsonb,
    'water_shutoff_added'
  )
  WHERE user_id = v_uid;
  ASSERT v_match_count = 1,
    format('Test 12 failed: notify_on=[water_shutoff_added] should match water_shutoff_added, got %s', v_match_count);

  RAISE NOTICE 'Test 12 PASSED: notify_on whitelist enforced';
END $$;

ROLLBACK;
