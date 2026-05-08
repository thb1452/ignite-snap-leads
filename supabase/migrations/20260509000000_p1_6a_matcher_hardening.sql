-- =============================================================================
-- P1.6a Hardening — fn_property_matches_filter
-- =============================================================================
-- Closes 3 follow-up items from issue #165 against PR #163:
--
--   1. Volatility correction: function is IMMUTABLE but uses CURRENT_DATE
--      (which is STABLE per Postgres). Postgres may cache results during
--      query planning, so on a long-lived plan or partial index the
--      lastSeenDays window can become stale. Re-create as STABLE.
--
--   2. Defensive ::int casts. A malformed user-supplied filter_payload
--      (e.g. {"snapScoreRange":["abc",90]}, {"lastSeenDays":"7d"}) raises
--      `invalid_text_representation`. Because fn_find_saved_market_matches
--      calls the matcher in a WHERE clause, ONE bad row poisons the whole
--      RPC call → the fan-out worker treats it as a failure, the delta
--      hits DLQ after 3 retries, and that delta never reaches ANY user
--      via the saved_market source. Wrap each cast in a small
--      BEGIN/EXCEPTION block so a malformed value falls back to NULL
--      ("don't constrain") instead of throwing.
--
--   3. {} filter + NULL property edge case. With an empty filter we want
--      "match anything" semantics, but the existing early-exit
--      `IF p_property_state IS NULL THEN RETURN false` triggers when
--      filter is `{}` (not literal NULL). Add a short-circuit when no
--      filter constraints are active.
--
-- Strict scope:
--   - additive correction; no schema changes, no new tables
--   - no AI / no SnapScore / no billing/auth/export changes
--   - no worker code changes
--   - tests updated to cover the 3 new behaviors
--
-- Refs: issue #165, PR #163, docs/SNAP_INTELLIGENCE_ARCHITECTURE_2026.md §6
-- Rollback: supabase/migrations/rollback/20260509_p1_6a_matcher_hardening.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_property_matches_filter(
  p_filter         jsonb,
  p_property_state jsonb
) RETURNS boolean
LANGUAGE plpgsql
STABLE                                       -- ← was IMMUTABLE; CURRENT_DATE is STABLE
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

  v_has_constraint          boolean;
BEGIN
  IF p_filter IS NULL THEN
    RETURN true;  -- null filter = match everything
  END IF;

  -- ── Parse filter (camelCase contract) ────────────────────────────────────
  v_filter_state          := NULLIF(p_filter ->> 'state', '');
  v_filter_cities         := p_filter -> 'cities';
  v_filter_open_only      := COALESCE((p_filter ->> 'openViolationsOnly')::boolean, false);
  v_filter_repeat_only    := COALESCE((p_filter ->> 'repeatOffenderOnly')::boolean, false);
  v_filter_multiple_only  := COALESCE((p_filter ->> 'multipleViolationsOnly')::boolean, false);
  v_filter_violation_type := NULLIF(p_filter ->> 'violationType', '');

  -- Defensive int cast — malformed values fall back to NULL ("don't constrain")
  -- rather than raising invalid_text_representation.
  BEGIN
    v_filter_last_seen_days := NULLIF(p_filter ->> 'lastSeenDays', '')::int;
  EXCEPTION WHEN invalid_text_representation THEN
    v_filter_last_seen_days := NULL;
  END;

  IF (p_filter -> 'snapScoreRange') IS NOT NULL
     AND jsonb_typeof(p_filter -> 'snapScoreRange') = 'array'
     AND jsonb_array_length(p_filter -> 'snapScoreRange') >= 2 THEN
    BEGIN
      v_filter_score_min := NULLIF(((p_filter -> 'snapScoreRange') ->> 0), '')::int;
    EXCEPTION WHEN invalid_text_representation THEN
      v_filter_score_min := NULL;
    END;
    BEGIN
      v_filter_score_max := NULLIF(((p_filter -> 'snapScoreRange') ->> 1), '')::int;
    EXCEPTION WHEN invalid_text_representation THEN
      v_filter_score_max := NULL;
    END;
  END IF;

  -- ── Empty effective filter short-circuit ────────────────────────────────
  -- If the filter has no active constraints (all keys missing/null/empty/false),
  -- treat it as "match everything" regardless of property state.
  v_has_constraint :=
       v_filter_state IS NOT NULL
    OR (v_filter_cities IS NOT NULL
        AND jsonb_typeof(v_filter_cities) = 'array'
        AND jsonb_array_length(v_filter_cities) > 0)
    OR v_filter_score_min IS NOT NULL
    OR v_filter_score_max IS NOT NULL
    OR v_filter_open_only
    OR v_filter_repeat_only
    OR v_filter_multiple_only
    OR v_filter_violation_type IS NOT NULL
    OR (v_filter_last_seen_days IS NOT NULL AND v_filter_last_seen_days > 0);

  IF NOT v_has_constraint THEN
    RETURN true;
  END IF;

  -- ── Parse property state (snake_case contract) ───────────────────────────
  IF p_property_state IS NULL THEN
    -- An active filter cannot be matched against a null property.
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

  IF v_filter_state IS NOT NULL THEN
    IF v_property_state IS NULL OR LOWER(v_property_state) <> LOWER(v_filter_state) THEN
      RETURN false;
    END IF;
  END IF;

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

  IF v_filter_score_min IS NOT NULL AND v_property_score < v_filter_score_min THEN
    RETURN false;
  END IF;
  IF v_filter_score_max IS NOT NULL AND v_property_score > v_filter_score_max THEN
    RETURN false;
  END IF;

  IF v_filter_open_only AND v_property_open <= 0 THEN
    RETURN false;
  END IF;

  IF v_filter_multiple_only AND v_property_total < 2 THEN
    RETURN false;
  END IF;

  IF v_filter_repeat_only AND NOT v_property_repeat THEN
    RETURN false;
  END IF;

  IF v_filter_violation_type IS NOT NULL THEN
    IF NOT (v_filter_violation_type = ANY(v_property_violation_types)) THEN
      RETURN false;
    END IF;
  END IF;

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
   STABLE (uses CURRENT_DATE for lastSeenDays). Defensive int casts: malformed
   user input falls back to "don''t constrain" rather than raising. Empty
   effective filter short-circuits to true regardless of property state.
   Filter is camelCase (LeadFiltersSchema). Property state is snake_case.
   Hardening of PR #163 per issue #165.';
