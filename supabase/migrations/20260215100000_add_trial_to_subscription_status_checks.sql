-- ===================================================================
-- Add 'trial' to subscription status checks in data-access functions
-- ===================================================================
-- Trial users (status = 'trial') need access to property data and
-- features matching their trial_tier plan. Currently these functions
-- only check for 'active', 'trialing', 'past_due' — trial users
-- get fallback 'basic' tier with no subscription flag.
--
-- This migration adds 'trial' to the status checks so trial users
-- get proper data access and feature gating based on their plan.

-- 1. Update fn_get_user_subscription to include 'trial' status
CREATE OR REPLACE FUNCTION public.fn_get_user_subscription(p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE (
    subscription_id uuid,
    user_id uuid,
    plan_id uuid,
    plan_name text,
    display_name text,
    status text,
    current_period_start timestamp with time zone,
    current_period_end timestamp with time zone,
    max_monthly_exports integer,
    max_counties integer,
    max_user_seats integer,
    max_skip_traces_per_month integer,
    has_advanced_filters boolean,
    has_violation_filtering boolean,
    has_rolling_intelligence boolean,
    has_escalation_alerts boolean,
    has_api_access boolean,
    stripe_subscription_id text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        s.id as subscription_id,
        s.user_id,
        s.plan_id,
        p.name as plan_name,
        p.display_name,
        s.status,
        s.current_period_start,
        s.current_period_end,
        p.max_monthly_exports,
        p.max_counties,
        p.max_user_seats,
        p.max_skip_traces_per_month,
        p.has_advanced_filters,
        p.has_violation_filtering,
        p.has_rolling_intelligence,
        p.has_escalation_alerts,
        p.has_api_access,
        s.stripe_subscription_id
    FROM public.user_subscriptions s
    JOIN public.subscription_plans p ON s.plan_id = p.id
    WHERE s.user_id = p_user_id
    AND s.status IN ('active', 'trialing', 'past_due', 'trial')
    ORDER BY s.created_at DESC
    LIMIT 1;
$$;

-- 2. Update fn_properties_paged to include 'trial' status
CREATE OR REPLACE FUNCTION public.fn_properties_paged(
  p_page int DEFAULT 1,
  p_page_size int DEFAULT 50,
  p_state text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_snap_min int DEFAULT NULL,
  p_snap_max int DEFAULT NULL,
  p_last_seen_days int DEFAULT NULL,
  p_sort_by text DEFAULT 'newest_violation'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offset int;
  v_result jsonb;
  v_items jsonb;
  v_total bigint;
  v_user_id uuid := auth.uid();
  v_data_tier text;
  v_has_subscription boolean := false;
BEGIN
  v_offset := (p_page - 1) * p_page_size;

  -- Auth check
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'items', '[]'::jsonb,
      'total', 0,
      'page', p_page,
      'page_size', p_page_size,
      'has_subscription', false,
      'data_tier', 'none',
      'error', 'Authentication required'
    );
  END IF;

  -- Get data_tier from subscription (includes trial users)
  SELECT sp.data_tier
  INTO v_data_tier
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = v_user_id
    AND us.status IN ('active', 'trialing', 'past_due', 'trial')
  ORDER BY us.created_at DESC
  LIMIT 1;

  IF v_data_tier IS NOT NULL THEN
    v_has_subscription := true;
  ELSE
    v_data_tier := 'basic';
  END IF;

  IF v_data_tier != 'premium' THEN
    SELECT COUNT(*)
    INTO v_total
    FROM properties p
    WHERE
      p.enforcement_type = 'code_violation'
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
        p.enforcement_type = 'code_violation'
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
      ORDER BY
        CASE WHEN p_sort_by = 'newest_violation' THEN p.newest_violation_date END DESC NULLS LAST,
        CASE WHEN p_sort_by = 'recently_updated' THEN p.updated_at END DESC NULLS LAST,
        p.snap_score DESC NULLS LAST,
        p.id
      LIMIT p_page_size
      OFFSET v_offset
    ) t;
  ELSE
    SELECT COUNT(*)
    INTO v_total
    FROM properties p
    WHERE
      (p_state IS NULL OR p.state ILIKE p_state)
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
        (p_state IS NULL OR p.state ILIKE p_state)
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
      ORDER BY
        CASE WHEN p_sort_by = 'newest_violation' THEN p.newest_violation_date END DESC NULLS LAST,
        CASE WHEN p_sort_by = 'recently_updated' THEN p.updated_at END DESC NULLS LAST,
        p.snap_score DESC NULLS LAST,
        p.id
      LIMIT p_page_size
      OFFSET v_offset
    ) t;
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

-- 3. Update fn_map_markers to include 'trial' status
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
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'items', '[]'::jsonb,
      'total', 0,
      'error', 'Authentication required'
    );
  END IF;

  -- Get data_tier from subscription (includes trial users)
  SELECT sp.data_tier
  INTO v_data_tier
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = v_user_id
    AND us.status IN ('active', 'trialing', 'past_due', 'trial')
  ORDER BY us.created_at DESC
  LIMIT 1;

  IF v_data_tier IS NULL THEN
    RETURN jsonb_build_object(
      'items', '[]'::jsonb,
      'total', 0,
      'error', 'Active subscription required'
    );
  END IF;

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
