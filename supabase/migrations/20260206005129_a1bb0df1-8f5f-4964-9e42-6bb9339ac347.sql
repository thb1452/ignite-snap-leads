-- Function to fetch map markers within a geographic bounding box
-- This enables viewport-based loading for 270k+ properties
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
  p_limit integer DEFAULT 10000
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
BEGIN
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
    -- Geographic bounds filter
    p.latitude IS NOT NULL
    AND p.longitude IS NOT NULL
    AND p.latitude >= p_min_lat
    AND p.latitude <= p_max_lat
    AND p.longitude >= p_min_lng
    AND p.longitude <= p_max_lng
    -- Exclude invalid coordinates
    AND p.latitude != 0
    AND p.longitude != 0
    -- Optional filters
    AND (p_state IS NULL OR p.state ILIKE p_state)
    AND (p_city IS NULL OR p.city ILIKE p_city)
    AND (p_category IS NULL OR p_category = ANY(p.violation_types))
    AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
    AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
  ORDER BY p.snap_score DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.fn_map_markers_in_bounds TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.fn_map_markers_in_bounds IS 'Fetches map markers within geographic bounds for viewport-based loading. Supports optional filtering by state, city, category, and snap score range.';