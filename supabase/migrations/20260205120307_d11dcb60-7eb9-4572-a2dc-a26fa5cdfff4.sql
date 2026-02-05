-- Create a high-performance SQL function to backfill property aggregates
-- This replaces the slow edge function approach with a single SQL operation

CREATE OR REPLACE FUNCTION public.backfill_property_aggregates_batch(
  p_batch_size INTEGER DEFAULT 5000
)
RETURNS TABLE(
  processed INTEGER,
  updated INTEGER,
  remaining INTEGER
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_processed INTEGER := 0;
  v_updated INTEGER := 0;
  v_remaining INTEGER := 0;
BEGIN
  -- Update properties with stale aggregates using a single efficient query
  WITH stale_properties AS (
    SELECT id
    FROM properties
    WHERE total_violations = 0 OR total_violations IS NULL
    LIMIT p_batch_size
  ),
  violation_aggregates AS (
    SELECT 
      v.property_id,
      COUNT(*)::INTEGER AS total_violations,
      COUNT(*) FILTER (WHERE LOWER(TRIM(v.status)) = 'open')::INTEGER AS open_violations,
      ARRAY_AGG(DISTINCT v.violation_type) FILTER (WHERE v.violation_type IS NOT NULL AND v.violation_type != '') AS violation_types,
      COUNT(DISTINCT v.case_id) FILTER (WHERE v.case_id IS NOT NULL AND v.case_id != '') > 1 AS repeat_offender,
      MAX(v.opened_date) AS last_enforcement_date
    FROM violations v
    INNER JOIN stale_properties sp ON v.property_id = sp.id
    GROUP BY v.property_id
  )
  UPDATE properties p
  SET 
    total_violations = COALESCE(va.total_violations, 0),
    open_violations = COALESCE(va.open_violations, 0),
    violation_types = COALESCE(va.violation_types, ARRAY[]::TEXT[]),
    repeat_offender = COALESCE(va.repeat_offender, FALSE),
    last_enforcement_date = va.last_enforcement_date,
    updated_at = NOW()
  FROM stale_properties sp
  LEFT JOIN violation_aggregates va ON sp.id = va.property_id
  WHERE p.id = sp.id;
  
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  v_processed := v_updated;
  
  -- Count remaining
  SELECT COUNT(*)::INTEGER INTO v_remaining
  FROM properties
  WHERE total_violations = 0 OR total_violations IS NULL;
  
  RETURN QUERY SELECT v_processed, v_updated, v_remaining;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.backfill_property_aggregates_batch TO authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_property_aggregates_batch TO service_role;