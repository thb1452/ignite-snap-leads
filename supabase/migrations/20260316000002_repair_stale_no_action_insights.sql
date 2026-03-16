-- ============================================================================
-- REPAIR: Reset stale "No active enforcement actions" insights
--
-- Scenario: The generate-insights function ran on properties while their
-- violation data was temporarily unavailable or before violations were
-- imported, generating "No active enforcement actions currently on file."
-- Those properties may actually HAVE violations in the violations table.
--
-- This migration:
-- 1. Adds a SQL function to reset snap_insight = NULL for properties where
--    the insight says "no active" BUT violations DO exist in the DB.
--    Setting to NULL causes them to be picked up by "Fill Missing Insights."
--
-- 2. Does NOT touch properties that genuinely have no violations — their
--    "No active enforcement actions" insight is correct and stays.
--
-- To execute the repair, call:
--   SELECT * FROM repair_stale_no_action_insights();
-- Or run it immediately by uncommenting the last line of this file.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.repair_stale_no_action_insights(
  p_dry_run BOOLEAN DEFAULT TRUE
)
RETURNS TABLE(
  repaired  INTEGER,
  skipped   INTEGER,
  dry_run   BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_repaired INTEGER := 0;
  v_skipped  INTEGER := 0;
BEGIN
  -- Count properties where insight says "no active" but violations exist
  SELECT COUNT(*) INTO v_repaired
  FROM properties p
  WHERE p.snap_insight = 'No active enforcement actions currently on file.'
    AND EXISTS (SELECT 1 FROM violations v WHERE v.property_id = p.id LIMIT 1);

  -- Count properties where insight says "no active" AND truly no violations
  SELECT COUNT(*) INTO v_skipped
  FROM properties p
  WHERE p.snap_insight = 'No active enforcement actions currently on file.'
    AND NOT EXISTS (SELECT 1 FROM violations v WHERE v.property_id = p.id LIMIT 1);

  IF NOT p_dry_run THEN
    -- Reset snap_insight to NULL for properties that have violations.
    -- They will be picked up by the next "Fill Missing Insights" run.
    UPDATE properties p
    SET
      snap_insight     = NULL,
      last_analyzed_at = NULL
    WHERE p.snap_insight = 'No active enforcement actions currently on file.'
      AND EXISTS (SELECT 1 FROM violations v WHERE v.property_id = p.id LIMIT 1);
  END IF;

  RETURN QUERY SELECT v_repaired, v_skipped, p_dry_run;
END;
$$;

GRANT EXECUTE ON FUNCTION public.repair_stale_no_action_insights(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repair_stale_no_action_insights(BOOLEAN) TO service_role;

-- ============================================================================
-- HOW TO USE:
--
-- Step 1 — Dry-run to see how many would be repaired (safe, no changes):
--   SELECT * FROM repair_stale_no_action_insights(true);
--
-- Step 2 — If repaired > 0 and you want to fix them, run for real:
--   SELECT * FROM repair_stale_no_action_insights(false);
--
-- Step 3 — Then click "Fill Missing Insights (Rule-based)" in the UI
--   to regenerate those properties using the correct violations data.
-- ============================================================================
