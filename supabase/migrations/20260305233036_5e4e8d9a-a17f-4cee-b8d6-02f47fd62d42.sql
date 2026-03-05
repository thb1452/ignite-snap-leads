CREATE OR REPLACE FUNCTION public.fn_properties_by_category(
  p_category text,
  p_state text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_snap_min integer DEFAULT NULL,
  p_snap_max integer DEFAULT NULL,
  p_last_seen_days integer DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_keywords text[];
  v_offset int;
  v_result jsonb;
  v_items jsonb;
  v_total bigint;
  v_is_water_disconnection boolean := false;
BEGIN
  v_offset := (p_page - 1) * p_page_size;
  
  -- Special handling for water_disconnection category
  IF p_category = 'water_disconnection' THEN
    v_is_water_disconnection := true;
  ELSE
    -- Map category to keywords
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
  
  -- Get total count
  SELECT COUNT(*)
  INTO v_total
  FROM properties p
  WHERE 
    -- Category filter
    CASE 
      WHEN v_is_water_disconnection THEN p.enforcement_type = 'water_shutoff'
      ELSE EXISTS (
        SELECT 1 FROM unnest(v_keywords) AS kw 
        WHERE array_to_string(p.violation_types, ' ') ILIKE '%' || kw || '%'
      )
    END
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
    AND (p_last_seen_days IS NULL OR p.updated_at >= NOW() - (p_last_seen_days || ' days')::interval);
  
  -- Get items
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
      CASE 
        WHEN v_is_water_disconnection THEN p.enforcement_type = 'water_shutoff'
        ELSE EXISTS (
          SELECT 1 FROM unnest(v_keywords) AS kw 
          WHERE array_to_string(p.violation_types, ' ') ILIKE '%' || kw || '%'
        )
      END
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
    ORDER BY p.snap_score DESC NULLS LAST
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
$$;