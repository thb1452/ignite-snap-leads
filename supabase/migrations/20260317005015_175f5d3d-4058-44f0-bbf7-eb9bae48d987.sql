
-- Fix fn_properties_paged to use exact count instead of stale pg_class estimate
CREATE OR REPLACE FUNCTION public.fn_properties_paged(
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50,
  p_state text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_snap_min integer DEFAULT NULL,
  p_snap_max integer DEFAULT NULL,
  p_last_seen_days integer DEFAULT NULL,
  p_sort_by text DEFAULT 'recently_updated',
  p_open_violations_only boolean DEFAULT false,
  p_multiple_violations_only boolean DEFAULT false,
  p_repeat_offender_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_offset integer;
  v_items jsonb;
  v_total bigint;
  v_data_tier text := 'full';
  v_cutoff_date timestamptz;
  v_has_filters boolean;
  v_scored_total bigint := 0;
  v_scored_100 bigint := 0;
  v_use_snap_score boolean := true;
BEGIN
  v_user_id := auth.uid();
  
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

  v_offset := (p_page - 1) * p_page_size;
  
  IF p_last_seen_days IS NOT NULL THEN
    v_cutoff_date := NOW() - (p_last_seen_days || ' days')::interval;
  END IF;
  
  v_has_filters := (p_state IS NOT NULL) OR (p_city IS NOT NULL) OR 
                   (p_search IS NOT NULL) OR (p_snap_min IS NOT NULL) OR 
                   (p_snap_max IS NOT NULL) OR (p_last_seen_days IS NOT NULL) OR
                   p_open_violations_only OR p_multiple_violations_only OR p_repeat_offender_only;

  -- Always use exact count to avoid stale estimates
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
    AND (v_cutoff_date IS NULL OR p.updated_at >= v_cutoff_date)
    AND (NOT p_open_violations_only OR COALESCE(p.open_violations, 0) > 0)
    AND (NOT p_multiple_violations_only OR COALESCE(p.total_violations, 0) > 1)
    AND (NOT p_repeat_offender_only OR p.repeat_offender = true);

  -- Decide whether snap_score is meaningful enough for ranking
  SELECT 
    COUNT(*) FILTER (WHERE p.snap_score IS NOT NULL),
    COUNT(*) FILTER (WHERE p.snap_score = 100)
  INTO v_scored_total, v_scored_100
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
    AND (NOT p_open_violations_only OR COALESCE(p.open_violations, 0) > 0)
    AND (NOT p_multiple_violations_only OR COALESCE(p.total_violations, 0) > 1)
    AND (NOT p_repeat_offender_only OR p.repeat_offender = true);

  IF v_scored_total = 0 THEN
    v_use_snap_score := false;
  ELSIF v_scored_100::numeric / v_scored_total::numeric >= 0.8 THEN
    v_use_snap_score := false;
  ELSE
    v_use_snap_score := true;
  END IF;

  IF p_sort_by = 'recently_updated' OR p_sort_by IS NULL THEN
    SELECT jsonb_agg(row_to_json(props)::jsonb)
    INTO v_items
    FROM (
      SELECT 
        p.id, p.address, p.city, p.state, p.zip, p.county,
        p.snap_score, p.snap_insight, p.total_violations, p.open_violations,
        p.oldest_violation_date, p.newest_violation_date, p.avg_days_open,
        p.repeat_offender, p.multi_department, p.escalated,
        p.opportunity_class, p.enforcement_type, p.violation_types,
        p.distress_signals, p.latitude, p.longitude, p.updated_at, p.created_at
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
        AND (NOT p_open_violations_only OR COALESCE(p.open_violations, 0) > 0)
        AND (NOT p_multiple_violations_only OR COALESCE(p.total_violations, 0) > 1)
        AND (NOT p_repeat_offender_only OR p.repeat_offender = true)
      ORDER BY p.updated_at DESC NULLS LAST
      LIMIT p_page_size OFFSET v_offset
    ) props;

  ELSIF p_sort_by = 'snap_score' THEN
    IF v_use_snap_score THEN
      SELECT jsonb_agg(row_to_json(props)::jsonb)
      INTO v_items
      FROM (
        SELECT 
          p.id, p.address, p.city, p.state, p.zip, p.county,
          p.snap_score, p.snap_insight, p.total_violations, p.open_violations,
          p.oldest_violation_date, p.newest_violation_date, p.avg_days_open,
          p.repeat_offender, p.multi_department, p.escalated,
          p.opportunity_class, p.enforcement_type, p.violation_types,
          p.distress_signals, p.latitude, p.longitude, p.updated_at, p.created_at
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
          AND (NOT p_open_violations_only OR COALESCE(p.open_violations, 0) > 0)
          AND (NOT p_multiple_violations_only OR COALESCE(p.total_violations, 0) > 1)
          AND (NOT p_repeat_offender_only OR p.repeat_offender = true)
        ORDER BY p.snap_score DESC NULLS LAST, p.total_violations DESC NULLS LAST
        LIMIT p_page_size OFFSET v_offset
      ) props;
    ELSE
      SELECT jsonb_agg(row_to_json(props)::jsonb)
      INTO v_items
      FROM (
        SELECT 
          p.id, p.address, p.city, p.state, p.zip, p.county,
          p.snap_score, p.snap_insight, p.total_violations, p.open_violations,
          p.oldest_violation_date, p.newest_violation_date, p.avg_days_open,
          p.repeat_offender, p.multi_department, p.escalated,
          p.opportunity_class, p.enforcement_type, p.violation_types,
          p.distress_signals, p.latitude, p.longitude, p.updated_at, p.created_at
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
          AND (NOT p_open_violations_only OR COALESCE(p.open_violations, 0) > 0)
          AND (NOT p_multiple_violations_only OR COALESCE(p.total_violations, 0) > 1)
          AND (NOT p_repeat_offender_only OR p.repeat_offender = true)
        ORDER BY p.total_violations DESC NULLS LAST, p.snap_score DESC NULLS LAST
        LIMIT p_page_size OFFSET v_offset
      ) props;
    END IF;

  ELSIF p_sort_by = 'newest_violation' THEN
    SELECT jsonb_agg(row_to_json(props)::jsonb)
    INTO v_items
    FROM (
      SELECT 
        p.id, p.address, p.city, p.state, p.zip, p.county,
        p.snap_score, p.snap_insight, p.total_violations, p.open_violations,
        p.oldest_violation_date, p.newest_violation_date, p.avg_days_open,
        p.repeat_offender, p.multi_department, p.escalated,
        p.opportunity_class, p.enforcement_type, p.violation_types,
        p.distress_signals, p.latitude, p.longitude, p.updated_at, p.created_at
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
        AND (NOT p_open_violations_only OR COALESCE(p.open_violations, 0) > 0)
        AND (NOT p_multiple_violations_only OR COALESCE(p.total_violations, 0) > 1)
        AND (NOT p_repeat_offender_only OR p.repeat_offender = true)
      ORDER BY p.newest_violation_date DESC NULLS LAST
      LIMIT p_page_size OFFSET v_offset
    ) props;

  ELSE
    -- Fallback: recently_updated
    SELECT jsonb_agg(row_to_json(props)::jsonb)
    INTO v_items
    FROM (
      SELECT 
        p.id, p.address, p.city, p.state, p.zip, p.county,
        p.snap_score, p.snap_insight, p.total_violations, p.open_violations,
        p.oldest_violation_date, p.newest_violation_date, p.avg_days_open,
        p.repeat_offender, p.multi_department, p.escalated,
        p.opportunity_class, p.enforcement_type, p.violation_types,
        p.distress_signals, p.latitude, p.longitude, p.updated_at, p.created_at
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
        AND (NOT p_open_violations_only OR COALESCE(p.open_violations, 0) > 0)
        AND (NOT p_multiple_violations_only OR COALESCE(p.total_violations, 0) > 1)
        AND (NOT p_repeat_offender_only OR p.repeat_offender = true)
      ORDER BY p.updated_at DESC NULLS LAST
      LIMIT p_page_size OFFSET v_offset
    ) props;
  END IF;

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
