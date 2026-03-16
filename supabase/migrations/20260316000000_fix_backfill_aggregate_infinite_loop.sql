-- ============================================================================
-- FIX: backfill_property_aggregates_batch infinite loop
--
-- BUG: The stale condition was `total_violations = 0 OR total_violations IS NULL`.
-- After processing, properties with no violations get total_violations = 0.
-- Those properties satisfy `= 0` → picked up again next batch → infinite loop
-- → progress always shows 0%.
--
-- FIX: Use `total_violations IS NULL` as the only stale indicator.
--   NULL  = never processed (stale)
--   0     = processed and confirmed to have zero violations (done)
--   > 0   = processed and has violations (done)
--
-- RESET: Set total_violations = NULL for all properties currently at 0 so
-- this run properly recounts them. The backfill will re-verify each one.
-- Properties that still have no violations get set back to 0 (correctly).
-- ============================================================================

-- Step 1: Reset currently-stuck properties from 0 → NULL so they get
--         re-processed in the next backfill run. This is a one-time correction;
--         the fixed function will never leave them in an infinite loop again.
UPDATE properties
SET total_violations = NULL
WHERE total_violations = 0;

-- Step 2: Replace the function with the corrected stale condition.
CREATE OR REPLACE FUNCTION public.backfill_property_aggregates_batch(
  p_batch_size INTEGER DEFAULT 5000
)
RETURNS TABLE(processed INTEGER, updated INTEGER, remaining INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_processed INTEGER := 0;
  v_updated INTEGER := 0;
  v_remaining INTEGER := 0;
BEGIN
  -- Only pick up properties that have never been aggregated (NULL).
  -- 0 = "processed, confirmed zero violations" — do NOT re-process.
  WITH stale_properties AS (
    SELECT id
    FROM properties
    WHERE total_violations IS NULL
    LIMIT p_batch_size
  ),
  violation_aggregates AS (
    SELECT
      v.property_id,
      COUNT(*)::INTEGER AS total_violations,
      COUNT(*) FILTER (WHERE LOWER(TRIM(v.status)) = 'open')::INTEGER AS open_violations,
      ARRAY_AGG(DISTINCT fn_normalize_violation_type(v.violation_type))
        FILTER (WHERE v.violation_type IS NOT NULL AND v.violation_type != '') AS violation_types,
      COUNT(DISTINCT v.case_id) FILTER (WHERE v.case_id IS NOT NULL AND v.case_id != '') > 1 AS repeat_offender,
      MAX(v.opened_date) AS last_enforcement_date
    FROM violations v
    INNER JOIN stale_properties sp ON v.property_id = sp.id
    GROUP BY v.property_id
  )
  UPDATE properties p
  SET
    total_violations      = COALESCE(va.total_violations, 0),
    open_violations       = COALESCE(va.open_violations, 0),
    violation_types       = COALESCE(va.violation_types, ARRAY[]::TEXT[]),
    repeat_offender       = COALESCE(va.repeat_offender, FALSE),
    last_enforcement_date = va.last_enforcement_date,
    updated_at            = NOW()
  FROM stale_properties sp
  LEFT JOIN violation_aggregates va ON sp.id = va.property_id
  WHERE p.id = sp.id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  v_processed := v_updated;

  -- Remaining = properties still unprocessed (NULL only)
  SELECT COUNT(*)::INTEGER INTO v_remaining
  FROM properties
  WHERE total_violations IS NULL;

  RETURN QUERY SELECT v_processed, v_updated, v_remaining;
END;
$$;

GRANT EXECUTE ON FUNCTION public.backfill_property_aggregates_batch(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_property_aggregates_batch(INTEGER) TO service_role;
