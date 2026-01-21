
-- =====================================================
-- FIX #1: ATOMIC USAGE CONSUMPTION (Race Condition Fix)
-- =====================================================
-- Problem: fn_consume_usage uses check-then-increment which allows race conditions
-- Fix: Use single atomic UPDATE...WHERE with row-level locking

CREATE OR REPLACE FUNCTION public.fn_consume_usage_atomic(
  p_usage_type text,
  p_amount integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_period_start date;
  v_period_end date;
  v_max_limit integer;
  v_plan_name text;
  v_new_count integer;
  v_old_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'not_authenticated',
      'message', 'Authentication required'
    );
  END IF;

  -- Get billing period and limits from subscription
  SELECT 
    us.current_period_start::date,
    us.current_period_end::date,
    CASE 
      WHEN p_usage_type = 'exports' THEN sp.max_monthly_exports
      WHEN p_usage_type = 'skip_traces' THEN sp.max_skip_traces_per_month
      ELSE 0
    END,
    sp.display_name
  INTO v_period_start, v_period_end, v_max_limit, v_plan_name
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = v_user_id
    AND us.status = 'active'
  LIMIT 1;

  -- Fallback to calendar month and starter limits if no subscription
  IF v_period_start IS NULL THEN
    v_period_start := date_trunc('month', CURRENT_DATE)::date;
    v_period_end := (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date;
    
    SELECT 
      CASE 
        WHEN p_usage_type = 'exports' THEN max_monthly_exports
        WHEN p_usage_type = 'skip_traces' THEN max_skip_traces_per_month
        ELSE 0
      END,
      display_name
    INTO v_max_limit, v_plan_name
    FROM subscription_plans
    WHERE name = 'starter'
    LIMIT 1;
  END IF;

  -- Handle unlimited plans (-1 means unlimited)
  IF v_max_limit = -1 THEN
    -- Still track usage for unlimited plans, just don't enforce
    INSERT INTO subscription_usage (user_id, period_start, period_end)
    VALUES (v_user_id, v_period_start, v_period_end)
    ON CONFLICT (user_id, period_start) DO NOTHING;
    
    IF p_usage_type = 'exports' THEN
      UPDATE subscription_usage
      SET exports_count = exports_count + p_amount, updated_at = now()
      WHERE user_id = v_user_id AND period_start = v_period_start
      RETURNING exports_count INTO v_new_count;
    ELSIF p_usage_type = 'skip_traces' THEN
      UPDATE subscription_usage
      SET skip_traces_count = skip_traces_count + p_amount, updated_at = now()
      WHERE user_id = v_user_id AND period_start = v_period_start
      RETURNING skip_traces_count INTO v_new_count;
    END IF;
    
    RETURN jsonb_build_object(
      'allowed', true,
      'consumed', p_amount,
      'current', COALESCE(v_new_count, p_amount),
      'limit', null,
      'remaining', null,
      'plan_name', v_plan_name,
      'unlimited', true
    );
  END IF;

  -- Ensure usage record exists
  INSERT INTO subscription_usage (user_id, period_start, period_end)
  VALUES (v_user_id, v_period_start, v_period_end)
  ON CONFLICT (user_id, period_start) DO NOTHING;

  -- ATOMIC CHECK-AND-INCREMENT
  -- This is the key fix: single UPDATE with WHERE clause that checks limit
  IF p_usage_type = 'exports' THEN
    UPDATE subscription_usage
    SET exports_count = exports_count + p_amount, updated_at = now()
    WHERE user_id = v_user_id 
      AND period_start = v_period_start
      AND exports_count + p_amount <= v_max_limit
    RETURNING exports_count, exports_count - p_amount INTO v_new_count, v_old_count;
  ELSIF p_usage_type = 'skip_traces' THEN
    UPDATE subscription_usage
    SET skip_traces_count = skip_traces_count + p_amount, updated_at = now()
    WHERE user_id = v_user_id 
      AND period_start = v_period_start
      AND skip_traces_count + p_amount <= v_max_limit
    RETURNING skip_traces_count, skip_traces_count - p_amount INTO v_new_count, v_old_count;
  ELSE
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'invalid_type',
      'message', 'Invalid usage type'
    );
  END IF;

  -- If UPDATE didn't match any rows, the limit was exceeded
  IF v_new_count IS NULL THEN
    -- Get current count for error message
    SELECT 
      CASE 
        WHEN p_usage_type = 'exports' THEN exports_count
        WHEN p_usage_type = 'skip_traces' THEN skip_traces_count
        ELSE 0
      END
    INTO v_old_count
    FROM subscription_usage
    WHERE user_id = v_user_id AND period_start = v_period_start;
    
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'limit_exceeded',
      'message', format('You have reached your monthly %s limit (%s/%s). Upgrade your plan for more.', 
                       p_usage_type, COALESCE(v_old_count, 0), v_max_limit),
      'current', COALESCE(v_old_count, 0),
      'limit', v_max_limit,
      'remaining', 0,
      'plan_name', v_plan_name
    );
  END IF;

  -- Success!
  RETURN jsonb_build_object(
    'allowed', true,
    'consumed', p_amount,
    'current', v_new_count,
    'limit', v_max_limit,
    'remaining', GREATEST(0, v_max_limit - v_new_count),
    'plan_name', v_plan_name
  );
END;
$$;

-- Replace the old function with the atomic version
DROP FUNCTION IF EXISTS public.fn_consume_usage(text, integer);

CREATE OR REPLACE FUNCTION public.fn_consume_usage(
  p_usage_type text,
  p_amount integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delegate to atomic implementation
  RETURN fn_consume_usage_atomic(p_usage_type, p_amount);
END;
$$;

-- =====================================================
-- FIX #2: COUNTY FILTERING IN fn_properties_paged
-- =====================================================
-- Problem: Users can query all 272K properties regardless of county limits
-- Fix: Filter properties by county based on subscription plan

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
  v_max_counties integer;
  v_allowed_counties text[];
  v_offset integer;
  v_total bigint;
  v_items jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'items', '[]'::jsonb,
      'total', 0,
      'error', 'Authentication required'
    );
  END IF;

  -- Get county limit from subscription
  SELECT sp.max_counties
  INTO v_max_counties
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = v_user_id
    AND us.status = 'active'
  LIMIT 1;

  -- Default to starter plan limit if no subscription
  IF v_max_counties IS NULL THEN
    SELECT max_counties INTO v_max_counties
    FROM subscription_plans
    WHERE name = 'starter'
    LIMIT 1;
    
    -- Ultimate fallback
    IF v_max_counties IS NULL THEN
      v_max_counties := 5;
    END IF;
  END IF;

  -- For limited plans, get the allowed counties
  -- We use the counties table to determine which counties the org has access to
  IF v_max_counties > 0 THEN
    -- Get the first N counties that have been assigned (organization-wide)
    -- Prioritize counties with assigned VAs, then by most recent upload
    SELECT ARRAY_AGG(DISTINCT c.county_name || '|' || c.state)
    INTO v_allowed_counties
    FROM (
      SELECT county_name, state
      FROM counties
      WHERE assigned_to IS NOT NULL
      ORDER BY last_upload_date DESC NULLS LAST, created_at
      LIMIT v_max_counties
    ) c;
    
    -- If no counties assigned yet, allow access to first N counties with data
    IF v_allowed_counties IS NULL OR array_length(v_allowed_counties, 1) IS NULL THEN
      SELECT ARRAY_AGG(DISTINCT p.county || '|' || p.state)
      INTO v_allowed_counties
      FROM (
        SELECT DISTINCT county, state
        FROM properties
        WHERE county IS NOT NULL
        ORDER BY county, state
        LIMIT v_max_counties
      ) p;
    END IF;
  END IF;

  v_offset := (p_page - 1) * p_page_size;

  -- Build count query with county filtering
  IF v_max_counties = -1 THEN
    -- Unlimited: no county filtering
    SELECT COUNT(*)
    INTO v_total
    FROM properties p
    WHERE (p_state IS NULL OR p.state = p_state)
      AND (p_city IS NULL OR p.city ILIKE p_city)
      AND (p_search IS NULL OR p.address ILIKE '%' || p_search || '%')
      AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
      AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max);
  ELSE
    -- Limited: filter by allowed counties
    SELECT COUNT(*)
    INTO v_total
    FROM properties p
    WHERE (p_state IS NULL OR p.state = p_state)
      AND (p_city IS NULL OR p.city ILIKE p_city)
      AND (p_search IS NULL OR p.address ILIKE '%' || p_search || '%')
      AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
      AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
      AND (
        v_allowed_counties IS NULL 
        OR array_length(v_allowed_counties, 1) IS NULL
        OR (p.county || '|' || p.state) = ANY(v_allowed_counties)
      );
  END IF;

  -- Build data query with county filtering
  IF v_max_counties = -1 THEN
    -- Unlimited: no county filtering
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
        p.latitude,
        p.longitude,
        p.total_violations,
        p.open_violations,
        p.oldest_violation_date,
        p.newest_violation_date,
        p.violation_types,
        p.distress_signals,
        p.opportunity_class,
        p.repeat_offender,
        p.multi_department,
        p.escalated,
        p.created_at,
        p.updated_at,
        p.jurisdiction_id
      FROM properties p
      WHERE (p_state IS NULL OR p.state = p_state)
        AND (p_city IS NULL OR p.city ILIKE p_city)
        AND (p_search IS NULL OR p.address ILIKE '%' || p_search || '%')
        AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
        AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
      ORDER BY p.snap_score DESC NULLS LAST, p.created_at DESC
      LIMIT p_page_size
      OFFSET v_offset
    ) props;
  ELSE
    -- Limited: filter by allowed counties
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
        p.latitude,
        p.longitude,
        p.total_violations,
        p.open_violations,
        p.oldest_violation_date,
        p.newest_violation_date,
        p.violation_types,
        p.distress_signals,
        p.opportunity_class,
        p.repeat_offender,
        p.multi_department,
        p.escalated,
        p.created_at,
        p.updated_at,
        p.jurisdiction_id
      FROM properties p
      WHERE (p_state IS NULL OR p.state = p_state)
        AND (p_city IS NULL OR p.city ILIKE p_city)
        AND (p_search IS NULL OR p.address ILIKE '%' || p_search || '%')
        AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
        AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
        AND (
          v_allowed_counties IS NULL 
          OR array_length(v_allowed_counties, 1) IS NULL
          OR (p.county || '|' || p.state) = ANY(v_allowed_counties)
        )
      ORDER BY p.snap_score DESC NULLS LAST, p.created_at DESC
      LIMIT p_page_size
      OFFSET v_offset
    ) props;
  END IF;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total', COALESCE(v_total, 0),
    'page', p_page,
    'page_size', p_page_size,
    'max_counties', v_max_counties,
    'allowed_counties_count', COALESCE(array_length(v_allowed_counties, 1), 0)
  );
END;
$$;

-- Also update fn_properties_by_bbox for map view
CREATE OR REPLACE FUNCTION public.fn_properties_by_bbox(
  p_min_lng numeric,
  p_min_lat numeric,
  p_max_lng numeric,
  p_max_lat numeric,
  p_score_min integer DEFAULT NULL,
  p_last_seen_after date DEFAULT NULL,
  p_source text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_max_counties integer;
  v_allowed_counties text[];
  v_total bigint;
  v_items jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'items', '[]'::jsonb,
      'total', 0,
      'error', 'Authentication required'
    );
  END IF;

  -- Get county limit from subscription
  SELECT sp.max_counties
  INTO v_max_counties
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = v_user_id
    AND us.status = 'active'
  LIMIT 1;

  -- Default to starter plan limit
  IF v_max_counties IS NULL THEN
    SELECT max_counties INTO v_max_counties
    FROM subscription_plans WHERE name = 'starter' LIMIT 1;
    IF v_max_counties IS NULL THEN v_max_counties := 5; END IF;
  END IF;

  -- Get allowed counties for limited plans
  IF v_max_counties > 0 THEN
    SELECT ARRAY_AGG(DISTINCT c.county_name || '|' || c.state)
    INTO v_allowed_counties
    FROM (
      SELECT county_name, state FROM counties
      WHERE assigned_to IS NOT NULL
      ORDER BY last_upload_date DESC NULLS LAST, created_at
      LIMIT v_max_counties
    ) c;
    
    IF v_allowed_counties IS NULL OR array_length(v_allowed_counties, 1) IS NULL THEN
      SELECT ARRAY_AGG(DISTINCT p.county || '|' || p.state)
      INTO v_allowed_counties
      FROM (
        SELECT DISTINCT county, state FROM properties
        WHERE county IS NOT NULL
        ORDER BY county, state LIMIT v_max_counties
      ) p;
    END IF;
  END IF;

  -- Query with county filtering
  IF v_max_counties = -1 THEN
    SELECT COUNT(*), jsonb_agg(row_to_json(props)::jsonb)
    INTO v_total, v_items
    FROM (
      SELECT id, address, city, state, zip, county, snap_score, latitude, longitude,
             total_violations, open_violations, violation_types, distress_signals,
             opportunity_class, repeat_offender, escalated
      FROM properties
      WHERE latitude BETWEEN p_min_lat AND p_max_lat
        AND longitude BETWEEN p_min_lng AND p_max_lng
        AND (p_score_min IS NULL OR snap_score >= p_score_min)
        AND (p_last_seen_after IS NULL OR newest_violation_date >= p_last_seen_after)
      ORDER BY snap_score DESC NULLS LAST
      LIMIT 2000
    ) props;
  ELSE
    SELECT COUNT(*), jsonb_agg(row_to_json(props)::jsonb)
    INTO v_total, v_items
    FROM (
      SELECT id, address, city, state, zip, county, snap_score, latitude, longitude,
             total_violations, open_violations, violation_types, distress_signals,
             opportunity_class, repeat_offender, escalated
      FROM properties
      WHERE latitude BETWEEN p_min_lat AND p_max_lat
        AND longitude BETWEEN p_min_lng AND p_max_lng
        AND (p_score_min IS NULL OR snap_score >= p_score_min)
        AND (p_last_seen_after IS NULL OR newest_violation_date >= p_last_seen_after)
        AND (
          v_allowed_counties IS NULL 
          OR array_length(v_allowed_counties, 1) IS NULL
          OR (county || '|' || state) = ANY(v_allowed_counties)
        )
      ORDER BY snap_score DESC NULLS LAST
      LIMIT 2000
    ) props;
  END IF;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total', COALESCE(v_total, 0),
    'bbox', jsonb_build_object(
      'min_lng', p_min_lng, 'min_lat', p_min_lat,
      'max_lng', p_max_lng, 'max_lat', p_max_lat
    )
  );
END;
$$;
