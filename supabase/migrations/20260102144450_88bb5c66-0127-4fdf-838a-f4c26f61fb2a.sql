-- Add composite index for the default query pattern (snap_score DESC with pagination)
CREATE INDEX IF NOT EXISTS idx_properties_snap_score_desc ON public.properties (snap_score DESC NULLS LAST);

-- Add composite index for state filtering (common filter)
CREATE INDEX IF NOT EXISTS idx_properties_state_lower ON public.properties (lower(state));

-- Add composite index for city filtering  
CREATE INDEX IF NOT EXISTS idx_properties_city_lower ON public.properties (lower(city));

-- Create a function to get properties with estimated count (much faster)
CREATE OR REPLACE FUNCTION fn_properties_paged(
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25,
  p_state text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_snap_min integer DEFAULT NULL,
  p_snap_max integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offset integer;
  v_result jsonb;
  v_count bigint;
  v_data jsonb;
BEGIN
  v_offset := (p_page - 1) * p_page_size;
  
  -- Get estimated count from stats (instant, good enough for pagination)
  SELECT reltuples::bigint INTO v_count
  FROM pg_class
  WHERE relname = 'properties';
  
  -- If filters are applied, use a filtered count (with limit for safety)
  IF p_state IS NOT NULL OR p_city IS NOT NULL OR p_search IS NOT NULL OR p_snap_min IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count
    FROM (
      SELECT 1 FROM properties p
      WHERE (p_state IS NULL OR lower(p.state) = lower(p_state))
        AND (p_city IS NULL OR lower(p.city) = lower(p_city))
        AND (p_search IS NULL OR 
             p.address ILIKE '%' || p_search || '%' OR
             p.city ILIKE '%' || p_search || '%' OR
             p.state ILIKE '%' || p_search || '%' OR
             p.zip ILIKE '%' || p_search || '%')
        AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
        AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
      LIMIT 10000  -- Cap count at 10000 for performance
    ) sub;
    
    -- If we hit the limit, just report 10000+
    IF v_count >= 10000 THEN
      v_count := 10000;
    END IF;
  END IF;
  
  -- Get the actual data
  SELECT jsonb_agg(row_to_json(sub.*))
  INTO v_data
  FROM (
    SELECT 
      p.id,
      p.address,
      p.city,
      p.state,
      p.zip,
      p.county,
      p.snap_score,
      p.snap_insight,
      p.updated_at,
      p.latitude,
      p.longitude,
      p.total_violations,
      p.open_violations,
      p.distress_signals,
      p.violation_types,
      p.opportunity_class
    FROM properties p
    WHERE (p_state IS NULL OR lower(p.state) = lower(p_state))
      AND (p_city IS NULL OR lower(p.city) = lower(p_city))
      AND (p_search IS NULL OR 
           p.address ILIKE '%' || p_search || '%' OR
           p.city ILIKE '%' || p_search || '%' OR
           p.state ILIKE '%' || p_search || '%' OR
           p.zip ILIKE '%' || p_search || '%')
      AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
      AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
    ORDER BY p.snap_score DESC NULLS LAST
    LIMIT p_page_size
    OFFSET v_offset
  ) sub;
  
  RETURN jsonb_build_object(
    'data', COALESCE(v_data, '[]'::jsonb),
    'total', v_count,
    'page', p_page,
    'pageSize', p_page_size
  );
END;
$$;