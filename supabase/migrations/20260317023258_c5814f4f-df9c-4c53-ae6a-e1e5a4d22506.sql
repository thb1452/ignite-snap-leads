
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
  p_repeat_offender_only boolean DEFAULT false,
  p_random_seed text DEFAULT NULL
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
  v_has_filters boolean;
  v_scored_total bigint := 0;
  v_scored_100 bigint := 0;
  v_use_snap_score boolean := true;
  v_seed text;
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

  -- Use provided seed or generate from user_id
  v_seed := COALESCE(p_random_seed, v_user_id::text);

  v_offset := (p_page - 1) * p_page_size;
  
  IF p_last_seen_days IS NOT NULL THEN
    v_cutoff_date := NOW() - (p_last_seen_days || ' days')::interval;
  END IF;
  
  v_has_filters := (p_state IS NOT NULL) OR (p_city IS NOT NULL) OR 
                   (p_search IS NOT NULL) OR (p_snap_min IS NOT NULL) OR 
                   (p_snap_max IS NOT NULL) OR (p_last_seen_days IS NOT NULL) OR
                   p_open_violations_only OR p_multiple_violations_only OR p_repeat_offender_only;

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
      ORDER BY p.updated_at DESC NULLS LAST, md5(p.id::text || v_seed)
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
        ORDER BY p.snap_score DESC NULLS LAST, md5(p.id::text || v_seed), p.total_violations DESC NULLS LAST
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
        ORDER BY p.total_violations DESC NULLS LAST, md5(p.id::text || v_seed), p.snap_score DESC NULLS LAST
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
      ORDER BY p.newest_violation_date DESC NULLS LAST, md5(p.id::text || v_seed)
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
      ORDER BY p.updated_at DESC NULLS LAST, md5(p.id::text || v_seed)
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
$function$;

-- Also update fn_properties_by_category
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
  p_repeat_offender_only boolean DEFAULT false,
  p_random_seed text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_keywords text[];
  v_offset int;
  v_items jsonb;
  v_total bigint;
  v_is_water boolean := (p_category = 'water_disconnection');
  v_seed text;
BEGIN
  v_offset := (p_page - 1) * p_page_size;
  v_seed := COALESCE(p_random_seed, COALESCE(auth.uid()::text, 'default'));
  
  IF NOT v_is_water THEN
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
  END IF;
  
  SELECT COUNT(*) INTO v_total
  FROM properties p
  WHERE 
    CASE WHEN v_is_water THEN p.enforcement_type = 'water_shutoff'
    ELSE EXISTS (SELECT 1 FROM unnest(v_keywords) kw WHERE array_to_string(p.violation_types, ' ') ILIKE '%' || kw || '%')
    END
    AND (p_state IS NULL OR p.state ILIKE p_state)
    AND (p_city IS NULL OR p.city ILIKE p_city)
    AND (p_search IS NULL OR (p.address ILIKE '%'||p_search||'%' OR p.city ILIKE '%'||p_search||'%' OR p.state ILIKE '%'||p_search||'%' OR p.zip ILIKE '%'||p_search||'%'))
    AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
    AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
    AND (p_last_seen_days IS NULL OR p.updated_at >= NOW() - (p_last_seen_days || ' days')::interval)
    AND (NOT p_open_violations_only OR COALESCE(p.open_violations, 0) > 0)
    AND (NOT p_multiple_violations_only OR COALESCE(p.total_violations, 0) > 1)
    AND (NOT p_repeat_offender_only OR p.repeat_offender = true);
  
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
      CASE WHEN v_is_water THEN p.enforcement_type = 'water_shutoff'
      ELSE EXISTS (SELECT 1 FROM unnest(v_keywords) kw WHERE array_to_string(p.violation_types, ' ') ILIKE '%' || kw || '%')
      END
      AND (p_state IS NULL OR p.state ILIKE p_state)
      AND (p_city IS NULL OR p.city ILIKE p_city)
      AND (p_search IS NULL OR (p.address ILIKE '%'||p_search||'%' OR p.city ILIKE '%'||p_search||'%' OR p.state ILIKE '%'||p_search||'%' OR p.zip ILIKE '%'||p_search||'%'))
      AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
      AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
      AND (p_last_seen_days IS NULL OR p.updated_at >= NOW() - (p_last_seen_days || ' days')::interval)
      AND (NOT p_open_violations_only OR COALESCE(p.open_violations, 0) > 0)
      AND (NOT p_multiple_violations_only OR COALESCE(p.total_violations, 0) > 1)
      AND (NOT p_repeat_offender_only OR p.repeat_offender = true)
    ORDER BY 
      CASE WHEN p_sort_by = 'recently_updated' OR p_sort_by IS NULL THEN p.newest_violation_date END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'snap_score' THEN p.snap_score END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'newest_violation' THEN p.newest_violation_date END DESC NULLS LAST,
      md5(p.id::text || v_seed),
      p.id
    LIMIT p_page_size
    OFFSET v_offset
  ) t;
  
  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total', v_total,
    'page', p_page,
    'page_size', p_page_size
  );
END;
$function$;
