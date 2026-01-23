-- Add data_tier column to subscription_plans (basic = code violations only, premium = all data including water shutoffs)
ALTER TABLE public.subscription_plans 
ADD COLUMN IF NOT EXISTS data_tier text NOT NULL DEFAULT 'basic';

-- Add enforcement_type column to properties (code_violation or water_shutoff)
ALTER TABLE public.properties 
ADD COLUMN IF NOT EXISTS enforcement_type text NOT NULL DEFAULT 'code_violation';

-- Update subscription_plans with appropriate data tiers
-- Starter = basic (code violations only)
-- Professional = premium (code violations + water shutoffs)
-- Enterprise = premium (code violations + water shutoffs)
UPDATE public.subscription_plans SET data_tier = 'basic' WHERE name = 'starter';
UPDATE public.subscription_plans SET data_tier = 'premium' WHERE name = 'professional';
UPDATE public.subscription_plans SET data_tier = 'premium' WHERE name = 'enterprise';

-- All existing properties are code violations (as per user request)
-- New water shutoff data will be added later with enforcement_type = 'water_shutoff'

-- Remove state limits by setting all plans to unlimited (0 = unlimited)
UPDATE public.subscription_plans SET max_states = 0;

-- Update fn_properties_paged to filter by data_tier instead of states
CREATE OR REPLACE FUNCTION public.fn_properties_paged(
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50,
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
  v_data_tier text;
  v_items jsonb;
  v_total bigint;
  v_offset integer;
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

  -- Get data_tier from subscription
  SELECT sp.data_tier
  INTO v_data_tier
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = v_user_id
    AND us.status = 'active'
  LIMIT 1;

  -- Check if user has an active subscription
  v_has_subscription := (v_data_tier IS NOT NULL);

  -- NO SUBSCRIPTION = NO PROPERTIES
  IF NOT v_has_subscription THEN
    RETURN jsonb_build_object(
      'items', '[]'::jsonb,
      'total', 0,
      'page', p_page,
      'page_size', p_page_size,
      'has_subscription', false,
      'data_tier', null,
      'error', 'Active subscription required'
    );
  END IF;

  -- Filter by data_tier:
  -- 'basic' users only see code_violation properties
  -- 'premium' users see all properties (code_violation + water_shutoff)
  IF v_data_tier = 'basic' THEN
    -- Basic tier: only code violations
    SELECT COUNT(*)
    INTO v_total
    FROM properties p
    WHERE p.enforcement_type = 'code_violation'
      AND (p_state IS NULL OR UPPER(p.state) = UPPER(p_state))
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
        p.escalated, p.created_at, p.updated_at, p.jurisdiction_id,
        p.enforcement_type
      FROM properties p
      WHERE p.enforcement_type = 'code_violation'
        AND (p_state IS NULL OR UPPER(p.state) = UPPER(p_state))
        AND (p_city IS NULL OR p.city ILIKE p_city)
        AND (p_search IS NULL OR p.address ILIKE '%' || p_search || '%')
        AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
        AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
      ORDER BY p.snap_score DESC NULLS LAST, p.updated_at DESC
      LIMIT p_page_size
      OFFSET v_offset
    ) props;
  ELSE
    -- Premium tier: all properties
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
        p.escalated, p.created_at, p.updated_at, p.jurisdiction_id,
        p.enforcement_type
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
  END IF;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total', v_total,
    'page', p_page,
    'page_size', p_page_size,
    'has_subscription', v_has_subscription,
    'data_tier', v_data_tier
  );
END;
$$;

-- Update fn_map_markers similarly
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
  v_data_tier text;
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

  -- Get data_tier from subscription
  SELECT sp.data_tier
  INTO v_data_tier
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = v_user_id
    AND us.status = 'active'
  LIMIT 1;

  -- No subscription = no markers
  IF v_data_tier IS NULL THEN
    RETURN jsonb_build_object(
      'items', '[]'::jsonb,
      'total', 0,
      'error', 'Active subscription required'
    );
  END IF;

  -- Fetch markers based on data_tier
  IF v_data_tier = 'basic' THEN
    SELECT jsonb_agg(row_to_json(m)::jsonb)
    INTO v_items
    FROM (
      SELECT 
        p.id, p.latitude, p.longitude, p.snap_score, p.address, p.city, p.state, p.enforcement_type
      FROM properties p
      WHERE p.latitude IS NOT NULL
        AND p.longitude IS NOT NULL
        AND p.enforcement_type = 'code_violation'
        AND (p_state IS NULL OR UPPER(p.state) = UPPER(p_state))
        AND (p_city IS NULL OR p.city ILIKE p_city)
        AND (p_search IS NULL OR p.address ILIKE '%' || p_search || '%')
        AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
        AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
      ORDER BY p.snap_score DESC NULLS LAST
      LIMIT p_limit
    ) m;
  ELSE
    SELECT jsonb_agg(row_to_json(m)::jsonb)
    INTO v_items
    FROM (
      SELECT 
        p.id, p.latitude, p.longitude, p.snap_score, p.address, p.city, p.state, p.enforcement_type
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
    'total', COALESCE(jsonb_array_length(v_items), 0),
    'data_tier', v_data_tier
  );
END;
$$;

-- Update fn_dashboard_stats to filter by data_tier instead of states
CREATE OR REPLACE FUNCTION public.fn_dashboard_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_data_tier text;
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

  -- Get data_tier from subscription
  SELECT sp.data_tier
  INTO v_data_tier
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = v_user_id
    AND us.status = 'active'
  LIMIT 1;

  -- Build stats filtered by data_tier
  IF v_data_tier = 'basic' THEN
    -- Basic: only code violations
    SELECT json_build_object(
      'total_leads', (SELECT COUNT(*) FROM properties WHERE enforcement_type = 'code_violation'),
      'hot_leads', (SELECT COUNT(*) FROM properties WHERE snap_score >= 80 AND enforcement_type = 'code_violation'),
      'avg_snap_score', (SELECT COALESCE(ROUND(AVG(snap_score)), 0) FROM properties WHERE snap_score IS NOT NULL AND enforcement_type = 'code_violation'),
      'distressed_count', (SELECT COUNT(*) FROM properties WHERE snap_score >= 70 AND enforcement_type = 'code_violation'),
      'value_add_count', (SELECT COUNT(*) FROM properties WHERE snap_score >= 40 AND snap_score < 70 AND enforcement_type = 'code_violation'),
      'watch_count', (SELECT COUNT(*) FROM properties WHERE (snap_score < 40 OR snap_score IS NULL) AND enforcement_type = 'code_violation'),
      'distressed_avg', (SELECT COALESCE(ROUND(AVG(snap_score)), 0) FROM properties WHERE snap_score >= 70 AND enforcement_type = 'code_violation'),
      'value_add_avg', (SELECT COALESCE(ROUND(AVG(snap_score)), 0) FROM properties WHERE snap_score >= 40 AND snap_score < 70 AND enforcement_type = 'code_violation'),
      'watch_avg', (SELECT COALESCE(ROUND(AVG(snap_score)), 0) FROM properties WHERE snap_score < 40 AND snap_score IS NOT NULL AND enforcement_type = 'code_violation'),
      'data_tier', v_data_tier
    ) INTO result;
  ELSE
    -- Premium or no subscription: show all
    SELECT json_build_object(
      'total_leads', (SELECT COUNT(*) FROM properties),
      'hot_leads', (SELECT COUNT(*) FROM properties WHERE snap_score >= 80),
      'avg_snap_score', (SELECT COALESCE(ROUND(AVG(snap_score)), 0) FROM properties WHERE snap_score IS NOT NULL),
      'distressed_count', (SELECT COUNT(*) FROM properties WHERE snap_score >= 70),
      'value_add_count', (SELECT COUNT(*) FROM properties WHERE snap_score >= 40 AND snap_score < 70),
      'watch_count', (SELECT COUNT(*) FROM properties WHERE snap_score < 40 OR snap_score IS NULL),
      'distressed_avg', (SELECT COALESCE(ROUND(AVG(snap_score)), 0) FROM properties WHERE snap_score >= 70),
      'value_add_avg', (SELECT COALESCE(ROUND(AVG(snap_score)), 0) FROM properties WHERE snap_score >= 40 AND snap_score < 70),
      'watch_avg', (SELECT COALESCE(ROUND(AVG(snap_score)), 0) FROM properties WHERE snap_score < 40 AND snap_score IS NOT NULL),
      'data_tier', v_data_tier
    ) INTO result;
  END IF;
  
  RETURN result;
END;
$$;

-- Create index for enforcement_type for better query performance
CREATE INDEX IF NOT EXISTS idx_properties_enforcement_type ON public.properties(enforcement_type);