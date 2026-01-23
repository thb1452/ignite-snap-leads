-- Update fn_dashboard_stats to filter by user's allowed states
CREATE OR REPLACE FUNCTION public.fn_dashboard_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_max_states integer;
  v_allowed_states text[];
  v_has_state_filter boolean := false;
  result JSON;
BEGIN
  -- Auth check
  IF v_user_id IS NULL THEN
    RETURN json_build_object(
      'total_leads', 0,
      'hot_leads', 0,
      'avg_snap_score', 0,
      'distressed_count', 0,
      'value_add_count', 0,
      'watch_count', 0,
      'distressed_avg', 0,
      'value_add_avg', 0,
      'watch_avg', 0
    );
  END IF;

  -- Get state limit from subscription
  SELECT sp.max_states
  INTO v_max_states
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = v_user_id
    AND us.status = 'active'
  LIMIT 1;

  -- Get user's allowed states if they have a limited plan
  IF v_max_states IS NOT NULL AND v_max_states > 0 THEN
    SELECT ARRAY_AGG(UPPER(state))
    INTO v_allowed_states
    FROM user_allowed_states
    WHERE user_id = v_user_id;
    
    v_has_state_filter := (v_allowed_states IS NOT NULL AND array_length(v_allowed_states, 1) > 0);
  END IF;

  -- Build stats filtered by allowed states (or all if enterprise/no selection)
  IF v_has_state_filter THEN
    SELECT json_build_object(
      'total_leads', (SELECT COUNT(*) FROM properties WHERE UPPER(state) = ANY(v_allowed_states)),
      'hot_leads', (SELECT COUNT(*) FROM properties WHERE snap_score >= 80 AND UPPER(state) = ANY(v_allowed_states)),
      'avg_snap_score', (SELECT COALESCE(ROUND(AVG(snap_score)), 0) FROM properties WHERE snap_score IS NOT NULL AND UPPER(state) = ANY(v_allowed_states)),
      'distressed_count', (SELECT COUNT(*) FROM properties WHERE snap_score >= 70 AND UPPER(state) = ANY(v_allowed_states)),
      'value_add_count', (SELECT COUNT(*) FROM properties WHERE snap_score >= 40 AND snap_score < 70 AND UPPER(state) = ANY(v_allowed_states)),
      'watch_count', (SELECT COUNT(*) FROM properties WHERE (snap_score < 40 OR snap_score IS NULL) AND UPPER(state) = ANY(v_allowed_states)),
      'distressed_avg', (SELECT COALESCE(ROUND(AVG(snap_score)), 0) FROM properties WHERE snap_score >= 70 AND UPPER(state) = ANY(v_allowed_states)),
      'value_add_avg', (SELECT COALESCE(ROUND(AVG(snap_score)), 0) FROM properties WHERE snap_score >= 40 AND snap_score < 70 AND UPPER(state) = ANY(v_allowed_states)),
      'watch_avg', (SELECT COALESCE(ROUND(AVG(snap_score)), 0) FROM properties WHERE snap_score < 40 AND snap_score IS NOT NULL AND UPPER(state) = ANY(v_allowed_states))
    ) INTO result;
  ELSE
    -- Enterprise or no state selection - show all
    SELECT json_build_object(
      'total_leads', (SELECT COUNT(*) FROM properties),
      'hot_leads', (SELECT COUNT(*) FROM properties WHERE snap_score >= 80),
      'avg_snap_score', (SELECT COALESCE(ROUND(AVG(snap_score)), 0) FROM properties WHERE snap_score IS NOT NULL),
      'distressed_count', (SELECT COUNT(*) FROM properties WHERE snap_score >= 70),
      'value_add_count', (SELECT COUNT(*) FROM properties WHERE snap_score >= 40 AND snap_score < 70),
      'watch_count', (SELECT COUNT(*) FROM properties WHERE snap_score < 40 OR snap_score IS NULL),
      'distressed_avg', (SELECT COALESCE(ROUND(AVG(snap_score)), 0) FROM properties WHERE snap_score >= 70),
      'value_add_avg', (SELECT COALESCE(ROUND(AVG(snap_score)), 0) FROM properties WHERE snap_score >= 40 AND snap_score < 70),
      'watch_avg', (SELECT COALESCE(ROUND(AVG(snap_score)), 0) FROM properties WHERE snap_score < 40 AND snap_score IS NOT NULL)
    ) INTO result;
  END IF;
  
  RETURN result;
END;
$$;

-- Create fn_map_markers to get map markers filtered by user's allowed states
CREATE OR REPLACE FUNCTION public.fn_map_markers(
  p_state text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_snap_min integer DEFAULT NULL,
  p_snap_max integer DEFAULT NULL,
  p_limit integer DEFAULT 50000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_max_states integer;
  v_allowed_states text[];
  v_has_state_filter boolean := false;
  v_items jsonb;
BEGIN
  -- Auth check
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'items', '[]'::jsonb,
      'total', 0,
      'error', 'Authentication required'
    );
  END IF;

  -- Get state limit from subscription
  SELECT sp.max_states
  INTO v_max_states
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = v_user_id
    AND us.status = 'active'
  LIMIT 1;

  -- No subscription = no markers
  IF v_max_states IS NULL THEN
    RETURN jsonb_build_object(
      'items', '[]'::jsonb,
      'total', 0,
      'error', 'Active subscription required'
    );
  END IF;

  -- Get user's allowed states if they have a limited plan
  IF v_max_states > 0 THEN
    SELECT ARRAY_AGG(UPPER(state))
    INTO v_allowed_states
    FROM user_allowed_states
    WHERE user_id = v_user_id;
    
    v_has_state_filter := (v_allowed_states IS NOT NULL AND array_length(v_allowed_states, 1) > 0);
  END IF;

  -- Fetch markers
  IF v_has_state_filter THEN
    SELECT jsonb_agg(row_to_json(m)::jsonb)
    INTO v_items
    FROM (
      SELECT 
        p.id, p.latitude, p.longitude, p.snap_score, p.address, p.city, p.state
      FROM properties p
      WHERE p.latitude IS NOT NULL
        AND p.longitude IS NOT NULL
        AND UPPER(p.state) = ANY(v_allowed_states)
        AND (p_state IS NULL OR UPPER(p.state) = UPPER(p_state))
        AND (p_city IS NULL OR p.city ILIKE p_city)
        AND (p_search IS NULL OR p.address ILIKE '%' || p_search || '%')
        AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
        AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
      ORDER BY p.snap_score DESC NULLS LAST
      LIMIT p_limit
    ) m;
  ELSE
    -- Enterprise or no state selection - show all
    SELECT jsonb_agg(row_to_json(m)::jsonb)
    INTO v_items
    FROM (
      SELECT 
        p.id, p.latitude, p.longitude, p.snap_score, p.address, p.city, p.state
      FROM properties p
      WHERE p.latitude IS NOT NULL
        AND p.longitude IS NOT NULL
        AND (p_state IS NULL OR UPPER(p.state) = UPPER(p_state))
        AND (p_city IS NULL OR p.city ILIKE p_city)
        AND (p_search IS NULL OR p.address ILIKE '%' || p_search || '%')
        AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
        AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
      ORDER BY p.snap_score DESC NULLS LAST
      LIMIT p_limit
    ) m;
  END IF;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total', COALESCE(jsonb_array_length(v_items), 0)
  );
END;
$$;