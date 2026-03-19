-- Stable sort so PostgREST .range() batches (offset pagination) never skip/duplicate rows
-- when many properties share the same snap_score.
CREATE OR REPLACE FUNCTION public.fn_map_markers_in_bounds(
  p_min_lat numeric,
  p_max_lat numeric,
  p_min_lng numeric,
  p_max_lng numeric,
  p_state text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_snap_min integer DEFAULT NULL,
  p_snap_max integer DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_last_seen_days integer DEFAULT NULL,
  p_open_violations_only boolean DEFAULT false,
  p_multiple_violations_only boolean DEFAULT false,
  p_repeat_offender_only boolean DEFAULT false,
  p_limit integer DEFAULT 60000
)
RETURNS TABLE (
  id uuid,
  latitude numeric,
  longitude numeric,
  snap_score integer,
  address text,
  city text,
  state text,
  enforcement_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff_date timestamptz;
BEGIN
  IF p_last_seen_days IS NOT NULL AND p_last_seen_days > 0 THEN
    v_cutoff_date := NOW() - (p_last_seen_days || ' days')::interval;
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    p.latitude,
    p.longitude,
    p.snap_score,
    p.address,
    p.city,
    p.state,
    p.enforcement_type
  FROM properties p
  WHERE 
    p.latitude IS NOT NULL
    AND p.longitude IS NOT NULL
    AND p.latitude >= p_min_lat
    AND p.latitude <= p_max_lat
    AND p.longitude >= p_min_lng
    AND p.longitude <= p_max_lng
    AND p.latitude != 0
    AND p.longitude != 0
    AND (p_state IS NULL OR p.state ILIKE p_state)
    AND (p_city IS NULL OR p.city ILIKE p_city)
    AND (p_category IS NULL OR p_category = ANY(p.violation_types))
    AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
    AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
    AND (p_search IS NULL OR p_search = '' OR
         p.address ILIKE '%' || p_search || '%' OR
         p.city ILIKE '%' || p_search || '%' OR
         p.state ILIKE '%' || p_search || '%' OR
         p.county ILIKE '%' || p_search || '%' OR
         p.zip ILIKE '%' || p_search || '%')
    AND (v_cutoff_date IS NULL OR p.updated_at >= v_cutoff_date)
    AND (NOT p_open_violations_only OR COALESCE(p.open_violations, 0) > 0)
    AND (NOT p_multiple_violations_only OR COALESCE(p.total_violations, 0) > 1)
    AND (NOT p_repeat_offender_only OR p.repeat_offender = true)
  ORDER BY p.snap_score DESC NULLS LAST, p.id ASC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.fn_map_markers_in_bounds IS 'Map markers in bounds; stable ORDER BY for batched .range() clients (Lovable max_rows=1000).';
