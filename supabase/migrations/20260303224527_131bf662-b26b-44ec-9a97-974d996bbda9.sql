
-- Update fn_properties_paged with geographic diversification and fixed sort
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

  IF NOT v_has_filters THEN
    SELECT GREATEST(reltuples::bigint, 0) INTO v_total
    FROM pg_class
    WHERE relname = 'properties' AND relnamespace = 'public'::regnamespace;
    
    IF v_total = 0 THEN
      SELECT COUNT(*) INTO v_total FROM properties;
    END IF;
  ELSE
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
  END IF;

  -- For recently_updated with geo diversification, use a CTE approach
  IF p_sort_by = 'recently_updated' OR p_sort_by IS NULL THEN
    SELECT jsonb_agg(row_to_json(props)::jsonb)
    INTO v_items
    FROM (
      WITH ranked AS (
        SELECT 
          p.id, p.address, p.city, p.state, p.zip, p.county,
          p.snap_score, p.snap_insight, p.total_violations, p.open_violations,
          p.oldest_violation_date, p.newest_violation_date, p.avg_days_open,
          p.repeat_offender, p.multi_department, p.escalated,
          p.opportunity_class, p.enforcement_type, p.violation_types,
          p.distress_signals, p.latitude, p.longitude, p.updated_at, p.created_at,
          ROW_NUMBER() OVER (PARTITION BY p.state, p.city ORDER BY p.updated_at DESC NULLS LAST) as city_rank
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
      )
      SELECT id, address, city, state, zip, county,
             snap_score, snap_insight, total_violations, open_violations,
             oldest_violation_date, newest_violation_date, avg_days_open,
             repeat_offender, multi_department, escalated,
             opportunity_class, enforcement_type, violation_types,
             distress_signals, latitude, longitude, updated_at, created_at
      FROM ranked
      ORDER BY city_rank ASC, updated_at DESC NULLS LAST, id
      LIMIT p_page_size
      OFFSET v_offset
    ) props;
  ELSE
    -- newest_violation sort
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
      ORDER BY p.newest_violation_date DESC NULLS LAST, p.id
      LIMIT p_page_size
      OFFSET v_offset
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

-- Update fn_properties_by_category with proper sort and geo diversification
CREATE OR REPLACE FUNCTION public.fn_properties_by_category(
  p_category text,
  p_state text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_snap_min integer DEFAULT NULL,
  p_snap_max integer DEFAULT NULL,
  p_last_seen_days integer DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50,
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
  v_keywords text[];
  v_offset int;
  v_items jsonb;
  v_total bigint;
BEGIN
  v_offset := (p_page - 1) * p_page_size;
  
  v_keywords := CASE p_category
    WHEN 'exterior' THEN ARRAY['Exterior']
    WHEN 'structural' THEN ARRAY['Structural']
    WHEN 'safety' THEN ARRAY['Safety', 'Fire']
    WHEN 'zoning' THEN ARRAY['Zoning']
    WHEN 'maintenance' THEN ARRAY['Rubbish', 'Grass', 'Trash', 'Debris', 'Weed', 'Dumping', 'Waste', 'Snow']
    WHEN 'interior' THEN ARRAY['Interior', 'Plumbing', 'HVAC', 'Furnace', '305.3', '305.6', '605.3', '403.', '504.', '506.', '605.']
    WHEN 'vacancy' THEN ARRAY['Vacancy', 'Vacant']
    WHEN 'other' THEN ARRAY['Unknown', 'Other', 'Complaint']
    ELSE ARRAY[initcap(p_category)]
  END;
  
  SELECT COUNT(*)
  INTO v_total
  FROM properties p
  WHERE 
    EXISTS (
      SELECT 1 FROM unnest(v_keywords) AS kw 
      WHERE array_to_string(p.violation_types, ' ') ILIKE '%' || kw || '%'
    )
    AND (p_state IS NULL OR p.state ILIKE p_state)
    AND (p_city IS NULL OR p.city ILIKE p_city)
    AND (p_search IS NULL OR (
      p.address ILIKE '%' || p_search || '%' OR
      p.city ILIKE '%' || p_search || '%' OR
      p.state ILIKE '%' || p_search || '%' OR
      p.zip ILIKE '%' || p_search || '%'
    ))
    AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
    AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
    AND (p_last_seen_days IS NULL OR p.updated_at >= NOW() - (p_last_seen_days || ' days')::interval)
    AND (NOT p_open_violations_only OR COALESCE(p.open_violations, 0) > 0)
    AND (NOT p_multiple_violations_only OR COALESCE(p.total_violations, 0) > 1)
    AND (NOT p_repeat_offender_only OR p.repeat_offender = true);
  
  IF p_sort_by = 'recently_updated' OR p_sort_by IS NULL THEN
    SELECT jsonb_agg(row_to_json(t))
    INTO v_items
    FROM (
      WITH ranked AS (
        SELECT 
          p.id, p.address, p.city, p.state, p.zip, p.county,
          p.snap_score, p.snap_insight, p.latitude, p.longitude,
          p.total_violations, p.open_violations, p.repeat_offender,
          p.oldest_violation_date, p.newest_violation_date,
          p.avg_days_open, p.opportunity_class, p.enforcement_type,
          p.violation_types, p.distress_signals,
          p.updated_at, p.created_at,
          ROW_NUMBER() OVER (PARTITION BY p.state, p.city ORDER BY p.updated_at DESC NULLS LAST) as city_rank
        FROM properties p
        WHERE 
          EXISTS (
            SELECT 1 FROM unnest(v_keywords) AS kw 
            WHERE array_to_string(p.violation_types, ' ') ILIKE '%' || kw || '%'
          )
          AND (p_state IS NULL OR p.state ILIKE p_state)
          AND (p_city IS NULL OR p.city ILIKE p_city)
          AND (p_search IS NULL OR (
            p.address ILIKE '%' || p_search || '%' OR
            p.city ILIKE '%' || p_search || '%' OR
            p.state ILIKE '%' || p_search || '%' OR
            p.zip ILIKE '%' || p_search || '%'
          ))
          AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
          AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
          AND (p_last_seen_days IS NULL OR p.updated_at >= NOW() - (p_last_seen_days || ' days')::interval)
          AND (NOT p_open_violations_only OR COALESCE(p.open_violations, 0) > 0)
          AND (NOT p_multiple_violations_only OR COALESCE(p.total_violations, 0) > 1)
          AND (NOT p_repeat_offender_only OR p.repeat_offender = true)
      )
      SELECT id, address, city, state, zip, county,
             snap_score, snap_insight, latitude, longitude,
             total_violations, open_violations, repeat_offender,
             oldest_violation_date, newest_violation_date,
             avg_days_open, opportunity_class, enforcement_type,
             violation_types, distress_signals,
             updated_at, created_at
      FROM ranked
      ORDER BY city_rank ASC, updated_at DESC NULLS LAST, id
      LIMIT p_page_size
      OFFSET v_offset
    ) t;
  ELSE
    SELECT jsonb_agg(row_to_json(t))
    INTO v_items
    FROM (
      SELECT 
        p.id, p.address, p.city, p.state, p.zip, p.county,
        p.snap_score, p.snap_insight, p.latitude, p.longitude,
        p.total_violations, p.open_violations, p.repeat_offender,
        p.oldest_violation_date, p.newest_violation_date,
        p.avg_days_open, p.opportunity_class, p.enforcement_type,
        p.violation_types, p.distress_signals,
        p.updated_at, p.created_at
      FROM properties p
      WHERE 
        EXISTS (
          SELECT 1 FROM unnest(v_keywords) AS kw 
          WHERE array_to_string(p.violation_types, ' ') ILIKE '%' || kw || '%'
        )
        AND (p_state IS NULL OR p.state ILIKE p_state)
        AND (p_city IS NULL OR p.city ILIKE p_city)
        AND (p_search IS NULL OR (
          p.address ILIKE '%' || p_search || '%' OR
          p.city ILIKE '%' || p_search || '%' OR
          p.state ILIKE '%' || p_search || '%' OR
          p.zip ILIKE '%' || p_search || '%'
        ))
        AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
        AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
        AND (p_last_seen_days IS NULL OR p.updated_at >= NOW() - (p_last_seen_days || ' days')::interval)
        AND (NOT p_open_violations_only OR COALESCE(p.open_violations, 0) > 0)
        AND (NOT p_multiple_violations_only OR COALESCE(p.total_violations, 0) > 1)
        AND (NOT p_repeat_offender_only OR p.repeat_offender = true)
      ORDER BY p.newest_violation_date DESC NULLS LAST, p.id
      LIMIT p_page_size
      OFFSET v_offset
    ) t;
  END IF;
  
  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total', v_total,
    'page', p_page,
    'page_size', p_page_size
  );
END;
$$;
