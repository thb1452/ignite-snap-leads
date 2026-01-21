-- Fix fn_properties_paged to show properties with NULL county
-- The issue: 99.6% of properties have NULL county, causing "No properties found"
-- Solution: When v_allowed_counties is empty or NULL, show ALL properties (no geo restriction)

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
  v_has_county_filter boolean := false;
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
  IF v_max_counties > 0 THEN
    -- Get the first N counties that have been assigned (organization-wide)
    SELECT ARRAY_AGG(DISTINCT c.county_name || '|' || c.state)
    INTO v_allowed_counties
    FROM (
      SELECT county_name, state
      FROM counties
      WHERE assigned_to IS NOT NULL
      ORDER BY last_upload_date DESC NULLS LAST, created_at
      LIMIT v_max_counties
    ) c;
    
    -- Check if we actually have county restrictions
    v_has_county_filter := (v_allowed_counties IS NOT NULL AND array_length(v_allowed_counties, 1) > 0);
  END IF;

  v_offset := (p_page - 1) * p_page_size;

  -- Build count query
  -- KEY FIX: If no county filter is active, show ALL properties regardless of NULL county
  IF v_max_counties = -1 OR NOT v_has_county_filter THEN
    -- Unlimited OR no county restrictions: show all properties
    SELECT COUNT(*)
    INTO v_total
    FROM properties p
    WHERE (p_state IS NULL OR p.state = p_state)
      AND (p_city IS NULL OR p.city ILIKE p_city)
      AND (p_search IS NULL OR p.address ILIKE '%' || p_search || '%')
      AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
      AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max);
  ELSE
    -- Limited: filter by allowed counties (only when counties are actually assigned)
    SELECT COUNT(*)
    INTO v_total
    FROM properties p
    WHERE (p_state IS NULL OR p.state = p_state)
      AND (p_city IS NULL OR p.city ILIKE p_city)
      AND (p_search IS NULL OR p.address ILIKE '%' || p_search || '%')
      AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
      AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
      AND (
        p.county IS NULL 
        OR (p.county || '|' || p.state) = ANY(v_allowed_counties)
      );
  END IF;

  -- Build data query
  IF v_max_counties = -1 OR NOT v_has_county_filter THEN
    -- Unlimited OR no county restrictions: show all properties
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
      ORDER BY p.snap_score DESC NULLS LAST, p.updated_at DESC
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
          p.county IS NULL 
          OR (p.county || '|' || p.state) = ANY(v_allowed_counties)
        )
      ORDER BY p.snap_score DESC NULLS LAST, p.updated_at DESC
      LIMIT p_page_size
      OFFSET v_offset
    ) props;
  END IF;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total', v_total,
    'page', p_page,
    'pageSize', p_page_size,
    'totalPages', CEIL(v_total::numeric / p_page_size)
  );
END;
$$;

-- Also fix fn_properties_by_bbox for the map view
CREATE OR REPLACE FUNCTION public.fn_properties_by_bbox(
  p_min_lat double precision,
  p_min_lng double precision,
  p_max_lat double precision,
  p_max_lng double precision,
  p_limit integer DEFAULT 1000
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
  v_items jsonb;
  v_has_county_filter boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'items', '[]'::jsonb,
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
    
    IF v_max_counties IS NULL THEN
      v_max_counties := 5;
    END IF;
  END IF;

  -- For limited plans, get the allowed counties
  IF v_max_counties > 0 THEN
    SELECT ARRAY_AGG(DISTINCT c.county_name || '|' || c.state)
    INTO v_allowed_counties
    FROM (
      SELECT county_name, state
      FROM counties
      WHERE assigned_to IS NOT NULL
      ORDER BY last_upload_date DESC NULLS LAST, created_at
      LIMIT v_max_counties
    ) c;
    
    v_has_county_filter := (v_allowed_counties IS NOT NULL AND array_length(v_allowed_counties, 1) > 0);
  END IF;

  -- Build query - show all properties if no county filter is active
  IF v_max_counties = -1 OR NOT v_has_county_filter THEN
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
        p.latitude,
        p.longitude,
        p.total_violations,
        p.open_violations,
        p.opportunity_class
      FROM properties p
      WHERE p.latitude IS NOT NULL
        AND p.longitude IS NOT NULL
        AND p.latitude BETWEEN p_min_lat AND p_max_lat
        AND p.longitude BETWEEN p_min_lng AND p_max_lng
      ORDER BY p.snap_score DESC NULLS LAST
      LIMIT p_limit
    ) props;
  ELSE
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
        p.latitude,
        p.longitude,
        p.total_violations,
        p.open_violations,
        p.opportunity_class
      FROM properties p
      WHERE p.latitude IS NOT NULL
        AND p.longitude IS NOT NULL
        AND p.latitude BETWEEN p_min_lat AND p_max_lat
        AND p.longitude BETWEEN p_min_lng AND p_max_lng
        AND (
          p.county IS NULL 
          OR (p.county || '|' || p.state) = ANY(v_allowed_counties)
        )
      ORDER BY p.snap_score DESC NULLS LAST
      LIMIT p_limit
    ) props;
  END IF;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'count', jsonb_array_length(COALESCE(v_items, '[]'::jsonb))
  );
END;
$$;