
-- ============================================================================
-- UPDATE backfill_property_aggregates_batch to use normalized violation types
-- Also expand scope: process ALL properties, not just those with total_violations=0
-- ============================================================================

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
  
  SELECT COUNT(*)::INTEGER INTO v_remaining
  FROM properties
  WHERE total_violations = 0 OR total_violations IS NULL;
  
  RETURN QUERY SELECT v_processed, v_updated, v_remaining;
END;
$$;

-- ============================================================================
-- NEW: Normalize violation_types on ALL properties (not just stale ones)
-- This is the one-time backfill function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_normalize_violation_types_batch(
  p_batch_size INTEGER DEFAULT 5000
)
RETURNS TABLE(processed INTEGER, remaining INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_processed INTEGER := 0;
  v_remaining INTEGER := 0;
BEGIN
  -- Find properties that have un-normalized violation_types
  -- (contain values not in our standard set)
  WITH properties_to_fix AS (
    SELECT p.id
    FROM properties p
    WHERE p.violation_types IS NOT NULL 
      AND array_length(p.violation_types, 1) > 0
      AND EXISTS (
        SELECT 1 FROM unnest(p.violation_types) vt
        WHERE vt NOT IN ('Exterior', 'Safety', 'Zoning', 'Structural', 'Vacancy', 'Utility', 'Fire', 'Unknown')
      )
    LIMIT p_batch_size
  ),
  normalized AS (
    SELECT 
      ptf.id,
      ARRAY(
        SELECT DISTINCT fn_normalize_violation_type(vt)
        FROM unnest(
          (SELECT violation_types FROM properties WHERE id = ptf.id)
        ) AS vt
        WHERE fn_normalize_violation_type(vt) != 'Unknown'
      ) AS new_types
    FROM properties_to_fix ptf
  )
  UPDATE properties p
  SET 
    violation_types = CASE 
      WHEN array_length(n.new_types, 1) > 0 THEN n.new_types
      ELSE ARRAY['Unknown']::TEXT[]
    END,
    updated_at = NOW()
  FROM normalized n
  WHERE p.id = n.id;
  
  GET DIAGNOSTICS v_processed = ROW_COUNT;
  
  SELECT COUNT(*)::INTEGER INTO v_remaining
  FROM properties p
  WHERE p.violation_types IS NOT NULL 
    AND array_length(p.violation_types, 1) > 0
    AND EXISTS (
      SELECT 1 FROM unnest(p.violation_types) vt
      WHERE vt NOT IN ('Exterior', 'Safety', 'Zoning', 'Structural', 'Vacancy', 'Utility', 'Fire', 'Unknown')
    );
  
  RETURN QUERY SELECT v_processed, v_remaining;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_normalize_violation_types_batch(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_normalize_violation_types_batch(INTEGER) TO service_role;
