
-- Drop all existing overloads of fn_properties_paged
DROP FUNCTION IF EXISTS public.fn_properties_paged(integer, integer, text, text, text, integer, integer, integer);
DROP FUNCTION IF EXISTS public.fn_properties_paged(integer, integer, text, text, text, integer, integer, integer, text);

-- Create optimized fn_properties_paged with fast count estimation
CREATE OR REPLACE FUNCTION public.fn_properties_paged(
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50,
  p_state text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_snap_min integer DEFAULT NULL,
  p_snap_max integer DEFAULT NULL,
  p_last_seen_days integer DEFAULT NULL,
  p_sort_by text DEFAULT 'snap_score'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '30s'
AS $$
DECLARE
  v_user_id uuid;
  v_offset integer;
  v_items jsonb;
  v_total bigint;
  v_data_tier text := 'full';
  v_cutoff_date timestamptz;
  v_has_filters boolean;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  -- Must be authenticated
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'items', '[]'::jsonb,
      'total', 0,
      'page', p_page,
      'page_size', p_page_size,
      'has_subscription', false,
      'data_tier', null,
      'error', 'Authentication required'
    );
  END IF;

  -- Calculate offset
  v_offset := (p_page - 1) * p_page_size;
  
  -- Calculate cutoff date if lastSeenDays is specified
  IF p_last_seen_days IS NOT NULL THEN
    v_cutoff_date := NOW() - (p_last_seen_days || ' days')::interval;
  END IF;
  
  -- Check if we have significant filters
  v_has_filters := (p_state IS NOT NULL) OR (p_city IS NOT NULL) OR 
                   (p_search IS NOT NULL) OR (p_snap_min IS NOT NULL) OR 
                   (p_snap_max IS NOT NULL) OR (p_last_seen_days IS NOT NULL);

  -- Get total count - use fast estimate for unfiltered queries
  IF NOT v_has_filters THEN
    -- Fast path: use reltuples estimate for unfiltered queries
    SELECT GREATEST(reltuples::bigint, 0) INTO v_total
    FROM pg_class
    WHERE relname = 'properties' AND relnamespace = 'public'::regnamespace;
    
    -- If estimate is 0, fallback to actual count
    IF v_total = 0 THEN
      SELECT COUNT(*) INTO v_total FROM properties;
    END IF;
  ELSE
    -- Filtered query: need exact count but with timeout protection
    SELECT COUNT(*) INTO v_total
    FROM properties p
    WHERE (p_state IS NULL OR p.state ILIKE p_state)
      AND (p_city IS NULL OR p.city ILIKE p_city)
      AND (p_search IS NULL OR 
           p.address ILIKE '%' || p_search || '%' OR
           p.city ILIKE '%' || p_search || '%' OR
           p.state ILIKE '%' || p_search || '%' OR
           p.county ILIKE '%' || p_search || '%' OR
           p.zip ILIKE '%' || p_search || '%')
      AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
      AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
      AND (v_cutoff_date IS NULL OR p.updated_at >= v_cutoff_date);
  END IF;

  -- Get paginated items
  SELECT jsonb_agg(row_to_json(props)::jsonb)
  INTO v_items
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
      p.total_violations,
      p.open_violations,
      p.oldest_violation_date,
      p.newest_violation_date,
      p.avg_days_open,
      p.repeat_offender,
      p.multi_department,
      p.escalated,
      p.opportunity_class,
      p.enforcement_type,
      p.violation_types,
      p.distress_signals,
      p.latitude,
      p.longitude,
      p.updated_at,
      p.created_at
    FROM properties p
    WHERE (p_state IS NULL OR p.state ILIKE p_state)
      AND (p_city IS NULL OR p.city ILIKE p_city)
      AND (p_search IS NULL OR 
           p.address ILIKE '%' || p_search || '%' OR
           p.city ILIKE '%' || p_search || '%' OR
           p.state ILIKE '%' || p_search || '%' OR
           p.county ILIKE '%' || p_search || '%' OR
           p.zip ILIKE '%' || p_search || '%')
      AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
      AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
      AND (v_cutoff_date IS NULL OR p.updated_at >= v_cutoff_date)
    ORDER BY 
      CASE WHEN p_sort_by = 'snap_score' THEN p.snap_score END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'total_violations' THEN p.total_violations END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'updated_at' THEN p.updated_at END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'oldest_violation_date' THEN p.oldest_violation_date END ASC NULLS LAST,
      p.snap_score DESC NULLS LAST
    LIMIT p_page_size
    OFFSET v_offset
  ) props;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total', v_total,
    'page', p_page,
    'page_size', p_page_size,
    'has_subscription', true,
    'data_tier', v_data_tier
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.fn_properties_paged(integer, integer, text, text, text, integer, integer, integer, text) TO authenticated;
