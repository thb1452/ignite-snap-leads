-- =============================================================================
-- P1.6a: Saved-Market Filter Matcher (commit 1 / 2)
-- =============================================================================
-- Purpose:
-- Lets the watchlist-fanout-worker support a third event source — saved_market —
-- by re-applying a saved filter to a property's current state.
--
-- Contract (filter shape, mirrors src/schemas/index.ts LeadFiltersSchema, camelCase):
--   {
--     "state":               "IN" | string,
--     "cities":              ["Indianapolis", ...],
--     "snapScoreRange":      [min:int, max:int],
--     "lastSeenDays":        7..365,
--     "violationType":       "structural" | "water_shutoff" | ...,
--     "openViolationsOnly":  bool,
--     "multipleViolationsOnly": bool,
--     "repeatOffenderOnly":  bool
--   }
--
-- Property state shape (snake_case, written by signal-delta-worker into
-- property_snapshots.payload and signal_deltas.new_state):
--   {
--     "state": "IN", "city": "Indianapolis",
--     "snap_score": 78, "total_violations": 4, "open_violations": 2,
--     "repeat_offender": true, "escalated": false,
--     "violation_types": ["structural", ...],
--     "distress_signals": ["water_shutoff_enforcement"],
--     "newest_violation_date": "...", "oldest_violation_date": "..."
--   }
--
-- Strict scope:
--   - no AI / no LLM
--   - no SnapScore changes
--   - no billing/auth/export changes
--   - no public frontend changes
--   - no digest rewrite (P1.6b)
--   - additive only — only adds 2 IMMUTABLE/STABLE SQL functions
--   - coexists with P1, P1.5; no schema changes to existing tables
--
-- The watchlist-fanout-worker extension that consumes these lands in
-- commit 2 (a TS-only edge-function change, no migration).
--
-- Rollback:
--   See supabase/migrations/rollback/20260508_p1_6a_saved_market_matcher.sql
-- =============================================================================

-- ── fn_property_matches_filter ─────────────────────────────────────────────
-- Pure deterministic predicate. Returns true iff the property state would
-- have been included by the user's filter at search time. Missing or null
-- filter keys are treated as "do not constrain" (always pass).

CREATE OR REPLACE FUNCTION public.fn_property_matches_filter(
  p_filter         jsonb,
  p_property_state jsonb
) RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_filter_state            text;
  v_filter_cities           jsonb;
  v_filter_score_min        int;
  v_filter_score_max        int;
  v_filter_open_only        boolean;
  v_filter_repeat_only      boolean;
  v_filter_multiple_only    boolean;
  v_filter_violation_type   text;
  v_filter_last_seen_days   int;

  v_property_state          text;
  v_property_city           text;
  v_property_score          int;
  v_property_open           int;
  v_property_total          int;
  v_property_repeat         boolean;
  v_property_violation_types text[];
  v_property_newest_at      date;
BEGIN
  IF p_filter IS NULL THEN
    RETURN true;  -- empty/null filter = match everything
  END IF;

  -- ── Parse filter (camelCase contract) ────────────────────────────────────
  v_filter_state          := NULLIF(p_filter ->> 'state', '');
  v_filter_cities         := p_filter -> 'cities';
  v_filter_open_only      := COALESCE((p_filter ->> 'openViolationsOnly')::boolean, false);
  v_filter_repeat_only    := COALESCE((p_filter ->> 'repeatOffenderOnly')::boolean, false);
  v_filter_multiple_only  := COALESCE((p_filter ->> 'multipleViolationsOnly')::boolean, false);
  v_filter_violation_type := NULLIF(p_filter ->> 'violationType', '');
  v_filter_last_seen_days := NULLIF(p_filter ->> 'lastSeenDays', '')::int;

  IF (p_filter -> 'snapScoreRange') IS NOT NULL
     AND jsonb_typeof(p_filter -> 'snapScoreRange') = 'array'
     AND jsonb_array_length(p_filter -> 'snapScoreRange') >= 2 THEN
    v_filter_score_min := NULLIF(((p_filter -> 'snapScoreRange') ->> 0), '')::int;
    v_filter_score_max := NULLIF(((p_filter -> 'snapScoreRange') ->> 1), '')::int;
  END IF;

  -- ── Parse property state (snake_case contract) ───────────────────────────
  IF p_property_state IS NULL THEN
    -- Without a property to evaluate, only an empty filter matches.
    RETURN false;
  END IF;

  v_property_state := NULLIF(p_property_state ->> 'state', '');
  v_property_city  := NULLIF(p_property_state ->> 'city', '');
  v_property_score := COALESCE((p_property_state ->> 'snap_score')::int, 0);
  v_property_open  := COALESCE((p_property_state ->> 'open_violations')::int, 0);
  v_property_total := COALESCE((p_property_state ->> 'total_violations')::int, 0);
  v_property_repeat := COALESCE((p_property_state ->> 'repeat_offender')::boolean, false);

  BEGIN
    v_property_violation_types := COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(p_property_state -> 'violation_types')),
      ARRAY[]::text[]
    );
  EXCEPTION WHEN OTHERS THEN v_property_violation_types := ARRAY[]::text[];
  END;

  v_property_newest_at := NULLIF(p_property_state ->> 'newest_violation_date', '')::date;

  -- ── Apply filters ────────────────────────────────────────────────────────

  -- state (case-insensitive)
  IF v_filter_state IS NOT NULL THEN
    IF v_property_state IS NULL OR LOWER(v_property_state) <> LOWER(v_filter_state) THEN
      RETURN false;
    END IF;
  END IF;

  -- cities (any-of, case-insensitive)
  IF v_filter_cities IS NOT NULL
     AND jsonb_typeof(v_filter_cities) = 'array'
     AND jsonb_array_length(v_filter_cities) > 0 THEN
    IF v_property_city IS NULL THEN RETURN false; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(v_filter_cities) c
      WHERE LOWER(c) = LOWER(v_property_city)
    ) THEN
      RETURN false;
    END IF;
  END IF;

  -- snapScoreRange
  IF v_filter_score_min IS NOT NULL AND v_property_score < v_filter_score_min THEN
    RETURN false;
  END IF;
  IF v_filter_score_max IS NOT NULL AND v_property_score > v_filter_score_max THEN
    RETURN false;
  END IF;

  -- openViolationsOnly
  IF v_filter_open_only AND v_property_open <= 0 THEN
    RETURN false;
  END IF;

  -- multipleViolationsOnly (≥ 2 total, mirroring fn_properties_paged contract)
  IF v_filter_multiple_only AND v_property_total < 2 THEN
    RETURN false;
  END IF;

  -- repeatOffenderOnly
  IF v_filter_repeat_only AND NOT v_property_repeat THEN
    RETURN false;
  END IF;

  -- violationType (membership in violation_types array)
  IF v_filter_violation_type IS NOT NULL THEN
    IF NOT (v_filter_violation_type = ANY(v_property_violation_types)) THEN
      RETURN false;
    END IF;
  END IF;

  -- lastSeenDays (newest_violation_date within window)
  IF v_filter_last_seen_days IS NOT NULL AND v_filter_last_seen_days > 0 THEN
    IF v_property_newest_at IS NULL THEN RETURN false; END IF;
    IF v_property_newest_at < (CURRENT_DATE - v_filter_last_seen_days) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_property_matches_filter(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_property_matches_filter(jsonb, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_property_matches_filter(jsonb, jsonb) IS
  'Deterministic predicate: does this property state satisfy this saved filter?
   Filter is camelCase (LeadFiltersSchema). Property state is snake_case (worker
   writes). Empty/null filter = match everything. IMMUTABLE.';

-- ── fn_find_saved_market_matches ───────────────────────────────────────────
-- Returns (market_id, user_id) for every saved_market whose filter matches
-- this property state AND whose notify_on either includes this delta_type
-- or is empty (= "any delta type, subject to user_signal_preferences").
--
-- Worker calls this once per fan-out message; result feeds the candidate map.

CREATE OR REPLACE FUNCTION public.fn_find_saved_market_matches(
  p_property_state jsonb,
  p_delta_type     text
) RETURNS TABLE (
  market_id uuid,
  user_id   uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sm.id, sm.user_id
  FROM public.saved_markets sm
  WHERE
    -- notify_on: empty array OR contains the delta_type
    (
      jsonb_array_length(COALESCE(sm.notify_on, '[]'::jsonb)) = 0
      OR sm.notify_on ? p_delta_type
    )
    -- digest_cadence='off' opts the user out of fan-out for this market
    AND sm.digest_cadence <> 'off'
    -- filter must match the property's current state
    AND public.fn_property_matches_filter(
      COALESCE(sm.filter_payload, '{}'::jsonb),
      p_property_state
    );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_find_saved_market_matches(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_find_saved_market_matches(jsonb, text) TO service_role;

COMMENT ON FUNCTION public.fn_find_saved_market_matches(jsonb, text) IS
  'Server-side scan of saved_markets. SECURITY DEFINER so the worker can read
   all rows regardless of the caller. Skips markets with digest_cadence=off.
   Returns (market_id, user_id). STABLE (depends on saved_markets contents).';
