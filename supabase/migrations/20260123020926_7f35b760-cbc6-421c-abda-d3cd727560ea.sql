
-- Fix fn_properties_paged: NO subscription = NO properties
CREATE OR REPLACE FUNCTION public.fn_properties_paged(
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
  v_user_id uuid := auth.uid();
  v_max_states integer;
  v_allowed_states text[];
  v_items jsonb;
  v_total bigint;
  v_offset integer;
  v_has_state_filter boolean := false;
  v_has_subscription boolean := false;
BEGIN
  -- Auth check
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'items', '[]'::jsonb,
      'total', 0,
      'page', p_page,
      'page_size', p_page_size,
      'error', 'Authentication required'
    );
  END IF;

  v_offset := (p_page - 1) * p_page_size;

  -- Get state limit from subscription
  SELECT sp.max_states
  INTO v_max_states
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = v_user_id
    AND us.status = 'active'
  LIMIT 1;

  -- Check if user has an active subscription
  v_has_subscription := (v_max_states IS NOT NULL);

  -- NO SUBSCRIPTION = NO PROPERTIES
  IF NOT v_has_subscription THEN
    RETURN jsonb_build_object(
      'items', '[]'::jsonb,
      'total', 0,
      'page', p_page,
      'page_size', p_page_size,
      'allowed_states', ARRAY[]::text[],
      'has_state_filter', false,
      'has_subscription', false,
      'error', 'Active subscription required'
    );
  END IF;

  -- For users WITH limited subscription, get their allowed states
  IF v_max_states > 0 THEN
    SELECT ARRAY_AGG(UPPER(state))
    INTO v_allowed_states
    FROM user_allowed_states
    WHERE user_id = v_user_id;
    
    v_has_state_filter := (v_allowed_states IS NOT NULL AND array_length(v_allowed_states, 1) > 0);
  END IF;

  -- Enterprise plan (max_states = 0 means unlimited) OR user hasn't selected states yet
  IF v_max_states = 0 OR NOT v_has_state_filter THEN
    -- Show all properties for Enterprise OR until user picks states
    SELECT COUNT(*)
    INTO v_total
    FROM properties p
    WHERE (p_state IS NULL OR UPPER(p.state) = UPPER(p_state))
      AND (p_city IS NULL OR p.city ILIKE p_city)
      AND (p_search IS NULL OR p.address ILIKE '%' || p_search || '%')
      AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
      AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max);
    
    SELECT jsonb_agg(row_to_json(props)::jsonb)
    INTO v_items
    FROM (
      SELECT 
        p.id, p.address, p.city, p.state, p.zip, p.county,
        p.snap_score, p.snap_insight, p.latitude, p.longitude,
        p.total_violations, p.open_violations, p.oldest_violation_date,
        p.newest_violation_date, p.violation_types, p.distress_signals,
        p.opportunity_class, p.repeat_offender, p.multi_department,
        p.escalated, p.created_at, p.updated_at, p.jurisdiction_id
      FROM properties p
      WHERE (p_state IS NULL OR UPPER(p.state) = UPPER(p_state))
        AND (p_city IS NULL OR p.city ILIKE p_city)
        AND (p_search IS NULL OR p.address ILIKE '%' || p_search || '%')
        AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
        AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
      ORDER BY p.snap_score DESC NULLS LAST, p.updated_at DESC
      LIMIT p_page_size
      OFFSET v_offset
    ) props;
  ELSE
    -- Limited: filter by allowed states (case-insensitive)
    SELECT COUNT(*)
    INTO v_total
    FROM properties p
    WHERE (p_state IS NULL OR UPPER(p.state) = UPPER(p_state))
      AND (p_city IS NULL OR p.city ILIKE p_city)
      AND (p_search IS NULL OR p.address ILIKE '%' || p_search || '%')
      AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
      AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
      AND UPPER(p.state) = ANY(v_allowed_states);
    
    SELECT jsonb_agg(row_to_json(props)::jsonb)
    INTO v_items
    FROM (
      SELECT 
        p.id, p.address, p.city, p.state, p.zip, p.county,
        p.snap_score, p.snap_insight, p.latitude, p.longitude,
        p.total_violations, p.open_violations, p.oldest_violation_date,
        p.newest_violation_date, p.violation_types, p.distress_signals,
        p.opportunity_class, p.repeat_offender, p.multi_department,
        p.escalated, p.created_at, p.updated_at, p.jurisdiction_id
      FROM properties p
      WHERE (p_state IS NULL OR UPPER(p.state) = UPPER(p_state))
        AND (p_city IS NULL OR p.city ILIKE p_city)
        AND (p_search IS NULL OR p.address ILIKE '%' || p_search || '%')
        AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
        AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
        AND UPPER(p.state) = ANY(v_allowed_states)
      ORDER BY p.snap_score DESC NULLS LAST, p.updated_at DESC
      LIMIT p_page_size
      OFFSET v_offset
    ) props;
  END IF;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total', v_total,
    'page', p_page,
    'page_size', p_page_size,
    'allowed_states', COALESCE(v_allowed_states, ARRAY[]::text[]),
    'has_state_filter', v_has_state_filter,
    'has_subscription', v_has_subscription
  );
END;
$$;
