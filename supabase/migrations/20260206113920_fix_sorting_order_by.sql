-- Fix sorting to properly differentiate properties with same dates
-- When sorting by newest_violation or recently_updated, add snap_score as secondary sort
-- This ensures properties with the same date are ordered by score (most valuable first)

-- ============================================================
-- 1. Fix fn_properties_paged - improve ORDER BY
-- ============================================================
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

  -- Get data_tier from subscription
  SELECT sp.data_tier
  INTO v_data_tier
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = v_user_id
    AND us.status IN ('active', 'trialing', 'past_due')
  ORDER BY us.created_at DESC
  LIMIT 1;

  IF v_data_tier IS NOT NULL THEN
    v_has_subscription := true;
  ELSE
    v_data_tier := 'basic';  -- Default to basic (restricted) if no subscription
  END IF;

  -- Get total count with tier filtering
  -- Only 'premium' tier gets full access (including water_shutoff)
  -- 'basic' and 'none' tiers only see code_violation
  IF v_data_tier != 'premium' THEN
    -- Basic/Starter tier: only code_violation (excludes water_shutoff)
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
        -- Primary sort by selected option
        CASE WHEN p_sort_by = 'newest_violation' THEN p.newest_violation_date END DESC NULLS LAST,
        CASE WHEN p_sort_by = 'recently_updated' THEN p.updated_at END DESC NULLS LAST,
        -- Secondary sort by snap_score to differentiate properties with same dates
        p.snap_score DESC NULLS LAST,
        -- Stable tie-breaker
        p.id
      LIMIT p_page_size
      OFFSET v_offset
    ) t;
  ELSE
    -- Premium/Enterprise tier ONLY: all properties including water_shutoff
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
        -- Primary sort by selected option
        CASE WHEN p_sort_by = 'newest_violation' THEN p.newest_violation_date END DESC NULLS LAST,
        CASE WHEN p_sort_by = 'recently_updated' THEN p.updated_at END DESC NULLS LAST,
        -- Secondary sort by snap_score to differentiate properties with same dates
        p.snap_score DESC NULLS LAST,
        -- Stable tie-breaker
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

-- ============================================================
-- 2. Fix fn_properties_by_category - improve ORDER BY
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_properties_by_category(
  p_category text,
  p_state text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_snap_min int DEFAULT NULL,
  p_snap_max int DEFAULT NULL,
  p_last_seen_days int DEFAULT NULL,
  p_page int DEFAULT 1,
  p_page_size int DEFAULT 50,
  p_sort_by text DEFAULT 'newest_violation'
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
  v_user_id uuid := auth.uid();
  v_data_tier text;
BEGIN
  v_offset := (p_page - 1) * p_page_size;

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

  -- Get data_tier from subscription
  SELECT sp.data_tier
  INTO v_data_tier
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = v_user_id
    AND us.status IN ('active', 'trialing', 'past_due')
  ORDER BY us.created_at DESC
  LIMIT 1;

  -- Default to basic (restricted) if no subscription
  IF v_data_tier IS NULL THEN
    v_data_tier := 'basic';
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

  -- Only 'premium' tier gets full access (including water_shutoff)
  IF v_data_tier != 'premium' THEN
    -- Basic/Starter tier: only code_violation
    SELECT COUNT(*)
    INTO v_total
    FROM properties p
    WHERE
      p.enforcement_type = 'code_violation'
      AND EXISTS (
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
        AND EXISTS (
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
      ORDER BY
        -- Primary sort by selected option
        CASE WHEN p_sort_by = 'newest_violation' THEN p.newest_violation_date END DESC NULLS LAST,
        CASE WHEN p_sort_by = 'recently_updated' THEN p.updated_at END DESC NULLS LAST,
        -- Secondary sort by snap_score
        p.snap_score DESC NULLS LAST,
        p.id
      LIMIT p_page_size
      OFFSET v_offset
    ) t;
  ELSE
    -- Premium/Enterprise tier ONLY: all properties including water_shutoff
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
      ORDER BY
        -- Primary sort by selected option
        CASE WHEN p_sort_by = 'newest_violation' THEN p.newest_violation_date END DESC NULLS LAST,
        CASE WHEN p_sort_by = 'recently_updated' THEN p.updated_at END DESC NULLS LAST,
        -- Secondary sort by snap_score
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
    'page_size', p_page_size
  );
END;
$$;
