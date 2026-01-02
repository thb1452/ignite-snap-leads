-- Create RPC function to get violation counts scoped by state/city
CREATE OR REPLACE FUNCTION fn_violation_counts_by_area(
  p_state TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL
)
RETURNS TABLE (
  violation_type TEXT,
  count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.violation_type,
    COUNT(*)::BIGINT AS count
  FROM violations v
  JOIN properties p ON p.id = v.property_id
  WHERE
    (p_state IS NULL OR p.state = p_state)
    AND (p_city IS NULL OR p.city = p_city)
    AND v.violation_type IS NOT NULL
  GROUP BY v.violation_type
  ORDER BY count DESC;
END;
$$;