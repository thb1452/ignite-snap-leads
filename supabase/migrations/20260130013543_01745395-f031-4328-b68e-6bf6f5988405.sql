
-- Drop the existing function and recreate with new signature
DROP FUNCTION IF EXISTS public.fn_properties_paged(integer, integer, text, text, text, integer, integer);

-- Recreate with lastSeenDays support
CREATE OR REPLACE FUNCTION public.fn_properties_paged(
  p_page integer DEFAULT 1, 
  p_page_size integer DEFAULT 50, 
  p_state text DEFAULT NULL::text, 
  p_city text DEFAULT NULL::text, 
  p_search text DEFAULT NULL::text, 
  p_snap_min integer DEFAULT NULL::integer, 
  p_snap_max integer DEFAULT NULL::integer,
  p_last_seen_days integer DEFAULT NULL::integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_offset integer;
  v_items jsonb;
  v_total bigint;
  v_data_tier text := 'full';
  v_cutoff_date timestamptz;
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

  -- Get total count with all filters including date
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
    ORDER BY p.snap_score DESC NULLS LAST
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
$function$;
