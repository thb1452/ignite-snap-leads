-- =============================================================================
-- P1.6a Matcher Hardening — ROLLBACK
-- =============================================================================
-- Restores fn_property_matches_filter to the pre-hardening definition (the
-- one that landed with PR #163: IMMUTABLE volatility, no defensive int
-- handling, no empty-effective-filter short-circuit).
--
-- Idempotent. Does NOT touch fn_find_saved_market_matches, the worker, or
-- any data tables.
--
-- Usage:
--   psql $TARGET_DB_URL -f supabase/migrations/rollback/20260509_p1_6a_matcher_hardening.sql
--
-- WARNING: After rollback, malformed user-supplied filter_payload values
-- can again poison fan-out. Use only as a forward-recovery aid.
-- =============================================================================

BEGIN;

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
    RETURN true;
  END IF;

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

  IF p_property_state IS NULL THEN
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

COMMIT;
