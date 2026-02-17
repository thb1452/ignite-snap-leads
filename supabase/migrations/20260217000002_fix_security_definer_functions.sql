-- ===================================================================
-- Fix vulnerable SECURITY DEFINER functions with auth checks
-- ===================================================================
-- fn_bulk_run_inc: Add auth.uid() check + run ownership verification
-- fn_properties_untraced_in_list: Add auth.uid() check + list ownership
-- fn_properties_by_category: Add auth.uid() + subscription check
-- fn_map_markers_by_category: Add auth.uid() + subscription check
-- ===================================================================

-- 1. fn_bulk_run_inc - CRITICAL: was missing auth check, could update ANY run
CREATE OR REPLACE FUNCTION public.fn_bulk_run_inc(p_run_id text, p_field text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
BEGIN
  -- Auth check
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Ownership check: only update runs belonging to the authenticated user
  IF p_field = 'succeeded' THEN
    UPDATE skiptrace_bulk_runs
    SET succeeded = succeeded + 1
    WHERE run_id = p_run_id AND user_id = v_uid;
  ELSIF p_field = 'failed' THEN
    UPDATE skiptrace_bulk_runs
    SET failed = failed + 1
    WHERE run_id = p_run_id AND user_id = v_uid;
  END IF;
END;
$$;

-- 2. fn_properties_untraced_in_list - CRITICAL: was missing auth check
CREATE OR REPLACE FUNCTION public.fn_properties_untraced_in_list(p_list_id uuid, p_limit int DEFAULT 5000)
RETURNS TABLE(property_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_owner uuid;
BEGIN
  -- Auth check
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Ownership check: verify user owns this list
  SELECT l.user_id INTO v_owner
  FROM lists l
  WHERE l.id = p_list_id;

  IF v_owner IS NULL OR v_owner != v_uid THEN
    RAISE EXCEPTION 'Access denied: list not found or not owned by user';
  END IF;

  RETURN QUERY
  SELECT lp.property_id
  FROM list_properties lp
  LEFT JOIN property_contacts pc ON pc.property_id = lp.property_id
  WHERE lp.list_id = p_list_id
  GROUP BY lp.property_id
  HAVING COUNT(pc.property_id) = 0
  LIMIT p_limit;
END;
$$;

-- 3. fn_properties_by_category - MEDIUM: was missing auth + subscription check
CREATE OR REPLACE FUNCTION public.fn_properties_by_category(
  p_category text,
  p_state text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_snap_min int DEFAULT NULL,
  p_snap_max int DEFAULT NULL,
  p_last_seen_days int DEFAULT NULL,
  p_page int DEFAULT 1,
  p_page_size int DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_sub_status text;
  v_keywords text[];
  v_offset int;
  v_result jsonb;
  v_items jsonb;
  v_total bigint;
BEGIN
  -- Auth check
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Subscription check: user must have active or trial subscription
  SELECT us.status INTO v_sub_status
  FROM user_subscriptions us
  WHERE us.user_id = v_uid
  ORDER BY us.created_at DESC
  LIMIT 1;

  IF v_sub_status IS NULL OR v_sub_status NOT IN ('active', 'trialing', 'trial') THEN
    RAISE EXCEPTION 'Active subscription required';
  END IF;

  v_offset := (p_page - 1) * p_page_size;

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

  -- Get total count
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

-- 4. fn_map_markers_by_category - MEDIUM: was missing auth + subscription check
CREATE OR REPLACE FUNCTION public.fn_map_markers_by_category(
  p_category text,
  p_state text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_snap_min int DEFAULT NULL,
  p_snap_max int DEFAULT NULL,
  p_limit int DEFAULT 10000
)
RETURNS TABLE (
  id uuid,
  latitude numeric,
  longitude numeric,
  snap_score int,
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
  v_uid uuid;
  v_sub_status text;
  v_keywords text[];
BEGIN
  -- Auth check
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Subscription check: user must have active or trial subscription
  SELECT us.status INTO v_sub_status
  FROM user_subscriptions us
  WHERE us.user_id = v_uid
  ORDER BY us.created_at DESC
  LIMIT 1;

  IF v_sub_status IS NULL OR v_sub_status NOT IN ('active', 'trialing', 'trial') THEN
    RAISE EXCEPTION 'Active subscription required';
  END IF;

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

  RETURN QUERY
  SELECT
    p.id, p.latitude, p.longitude, p.snap_score,
    p.address, p.city, p.state, p.enforcement_type
  FROM properties p
  WHERE
    p.latitude IS NOT NULL
    AND p.longitude IS NOT NULL
    AND p.latitude != 0
    AND p.longitude != 0
    AND EXISTS (
      SELECT 1 FROM unnest(v_keywords) AS kw
      WHERE array_to_string(p.violation_types, ' ') ILIKE '%' || kw || '%'
    )
    AND (p_state IS NULL OR p.state ILIKE p_state)
    AND (p_city IS NULL OR p.city ILIKE p_city)
    AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
    AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
  ORDER BY p.snap_score DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

-- Ensure grants remain intact
GRANT EXECUTE ON FUNCTION public.fn_bulk_run_inc(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_properties_untraced_in_list(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_properties_by_category(text, text, text, text, int, int, int, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_map_markers_by_category(text, text, text, int, int, int) TO authenticated;
