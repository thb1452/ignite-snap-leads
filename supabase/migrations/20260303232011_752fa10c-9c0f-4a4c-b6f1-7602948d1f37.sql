
CREATE OR REPLACE FUNCTION public.fn_zip_pressure(
  p_state text DEFAULT NULL,
  p_city text DEFAULT NULL
)
RETURNS TABLE(
  zip text,
  avg_score numeric,
  property_count bigint,
  avg_lat numeric,
  avg_lng numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.zip,
    ROUND(AVG(p.snap_score)::numeric, 1) AS avg_score,
    COUNT(*) AS property_count,
    ROUND(AVG(p.latitude)::numeric, 6) AS avg_lat,
    ROUND(AVG(p.longitude)::numeric, 6) AS avg_lng
  FROM properties p
  WHERE p.latitude IS NOT NULL
    AND p.longitude IS NOT NULL
    AND p.snap_score IS NOT NULL
    AND p.zip IS NOT NULL
    AND p.zip != ''
    AND (p_state IS NULL OR p.state = p_state)
    AND (p_city IS NULL OR p.city = p_city)
  GROUP BY p.zip
  HAVING COUNT(*) >= 2
  ORDER BY AVG(p.snap_score) DESC
  LIMIT 500;
$$;
