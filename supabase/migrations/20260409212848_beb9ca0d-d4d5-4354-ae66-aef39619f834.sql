
CREATE OR REPLACE FUNCTION batch_normalize_violation_types(batch_size int DEFAULT 1000)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fixed int := 0;
BEGIN
  WITH targets AS (
    SELECT id FROM properties
    WHERE EXISTS (
      SELECT 1 FROM unnest(violation_types) vt
      WHERE vt NOT IN ('Exterior','Safety','Zoning','Structural','Vacancy','Utility','Fire','Unknown','Water Disconnection')
    )
    LIMIT batch_size
  ),
  updated AS (
    UPDATE properties p
    SET violation_types = (
      SELECT ARRAY(SELECT DISTINCT fn_normalize_violation_type(vt) FROM unnest(p.violation_types) vt)
    )
    FROM targets t
    WHERE p.id = t.id
    RETURNING p.id
  )
  SELECT count(*) INTO fixed FROM updated;
  
  RETURN fixed;
END;
$$;
