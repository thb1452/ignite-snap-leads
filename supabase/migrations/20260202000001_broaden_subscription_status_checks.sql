-- ===================================================================
-- Broaden subscription status checks to include 'past_due'
-- ===================================================================
-- Users with past_due status still have an active subscription,
-- they just have a payment issue. They should still see their plan
-- and be able to use the product while payment is retried.

-- 1. Update fn_get_user_subscription to also return past_due subscriptions
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
    AND s.status IN ('active', 'trialing', 'past_due')
    ORDER BY s.created_at DESC
    LIMIT 1;
$$;

-- 2. Update fn_map_markers to also accept trialing and past_due statuses
-- (Currently only checks status = 'active', blocking trialing/past_due users)
-- Re-read the current fn_map_markers and update the status check
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

  -- Get data_tier from subscription (accept active, trialing, and past_due)
  SELECT sp.data_tier
  INTO v_data_tier
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = v_user_id
    AND us.status IN ('active', 'trialing', 'past_due')
  ORDER BY us.created_at DESC
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

-- 3. Add exclusions to city materialized view for known garbage values
-- "Shipping Containers" and "Signage" are violation types, not cities
DROP MATERIALIZED VIEW IF EXISTS mv_distinct_cities CASCADE;

CREATE MATERIALIZED VIEW mv_distinct_cities AS
SELECT DISTINCT
  initcap(trim(city)) as city,
  upper(trim(state)) as state
FROM properties
WHERE city IS NOT NULL
  -- Basic length validation
  AND length(trim(city)) >= 2
  AND length(trim(city)) <= 50

  -- CRITICAL: Reject street addresses (numbers + street suffixes)
  AND city !~ '\d+\s+(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|ct|court|way|pl|place|pkwy|parkway|cir|circle)'

  -- Reject if starts with numbers
  AND city !~ '^\d+'

  -- Reject all numbers
  AND city !~ '^\d+$'

  -- Reject no letters at all
  AND city !~ '^[^a-zA-Z]*$'

  -- Reject dates (MM/DD/YYYY, YYYY-MM-DD)
  AND city !~ '\d{1,2}/\d{1,2}/\d{2,4}'
  AND city !~ '\d{4}-\d{2}-\d{2}'

  -- Reject zip codes
  AND city !~ '^\d{5}(-\d{4})?$'

  -- Reject multi-sentence text (notes)
  AND city !~ '\.\s+[A-Z]'

  -- Reject special characters (field headers, notes)
  AND city NOT LIKE '%:%'
  AND city NOT LIKE '%;%'
  AND city NOT LIKE '%(%'
  AND city NOT LIKE '%)%'
  AND city NOT LIKE '%[%'
  AND city NOT LIKE '%]%'
  AND city NOT LIKE '%#%'
  AND city NOT LIKE '%@%'
  AND city NOT LIKE '%*%'
  AND city NOT LIKE '%&%'

  -- Reject field headers
  AND city NOT ILIKE 'property address'
  AND city NOT ILIKE 'case number'
  AND city NOT ILIKE 'file%number%'
  AND city NOT ILIKE 'violation%type%'
  AND city NOT ILIKE 'description'
  AND city NOT ILIKE 'location'
  AND city NOT ILIKE 'address'
  AND city NOT ILIKE 'status'
  AND city NOT ILIKE 'date%opened%'
  AND city NOT ILIKE 'date%closed%'

  -- Reject violation keywords
  AND city NOT ILIKE '%violation%'
  AND city NOT ILIKE '%debris%'
  AND city NOT ILIKE '%trash%'
  AND city NOT ILIKE '%weeds%'
  AND city NOT ILIKE '%overgrown%'
  AND city NOT ILIKE '%illegal%'
  AND city NOT ILIKE '%unpermitted%'
  AND city NOT ILIKE '%hazard%'
  AND city NOT ILIKE '%unsafe%'
  AND city NOT ILIKE '%repair%'
  AND city NOT ILIKE '%maintain%'
  AND city NOT ILIKE '%fence%'
  AND city NOT ILIKE '%yard%'
  AND city NOT ILIKE '%building%'
  AND city NOT ILIKE '%structure%'
  AND city NOT ILIKE '%vehicle%'
  AND city NOT ILIKE '%junk%'
  AND city NOT ILIKE '%abandoned%'
  AND city NOT ILIKE '%permit%'
  AND city NOT ILIKE '%inspection%'
  AND city NOT ILIKE '%citation%'

  -- Reject instruction words
  AND city NOT ILIKE '%please%'
  AND city NOT ILIKE '%must%'
  AND city NOT ILIKE '%should%'
  AND city NOT ILIKE '%shall%'
  AND city NOT ILIKE '%required%'
  AND city NOT ILIKE '%notify%'

  -- Reject property parts
  AND city NOT ILIKE '%backyard%'
  AND city NOT ILIKE '%front%yard%'
  AND city NOT ILIKE '%porch%'
  AND city NOT ILIKE '%roof%'
  AND city NOT ILIKE '%window%'

  -- NEW: Reject known non-city values (violation types, object names)
  AND city NOT ILIKE '%shipping%'
  AND city NOT ILIKE '%container%'
  AND city NOT ILIKE '%signage%'
  AND city NOT ILIKE '%dumpster%'
  AND city NOT ILIKE '%storage%'
  AND city NOT ILIKE '%plumbing%'
  AND city NOT ILIKE '%electrical%'
  AND city NOT ILIKE '%mechanical%'
  AND city NOT ILIKE '%exterior%'
  AND city NOT ILIKE '%interior%'
  AND city NOT ILIKE '%structural%'
  AND city NOT ILIKE '%drainage%'
  AND city NOT ILIKE '%landscaping%'
  AND city NOT ILIKE '%parking%'
  AND city NOT ILIKE '%sidewalk%'
  AND city NOT ILIKE '%graffiti%'
  AND city NOT ILIKE '%litter%'
  AND city NOT ILIKE '%nuisance%'
  AND city NOT ILIKE '%zoning%'
  AND city NOT ILIKE '%condemned%'
  AND city NOT ILIKE '%demolition%'
  AND city NOT ILIKE '%vacant%'
  AND city NOT ILIKE '%boarded%'

  -- Only allow city names with mostly letters
  AND city ~ '^[A-Za-z\s\-''.]+$'

ORDER BY city;

-- Recreate indexes
CREATE UNIQUE INDEX idx_mv_distinct_cities_city_state ON mv_distinct_cities(city, state);
CREATE INDEX idx_mv_distinct_cities_state ON mv_distinct_cities(state);

-- Grant access
GRANT SELECT ON mv_distinct_cities TO authenticated, anon;

-- Recreate the RPC functions (they were dropped CASCADE)
CREATE OR REPLACE FUNCTION fn_distinct_states()
RETURNS TABLE(state text)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT state FROM mv_distinct_states ORDER BY state;
$$;

CREATE OR REPLACE FUNCTION fn_distinct_cities(p_state text DEFAULT NULL)
RETURNS TABLE(city text)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT DISTINCT city
  FROM mv_distinct_cities
  WHERE (p_state IS NULL OR mv_distinct_cities.state = upper(p_state))
  ORDER BY city
  LIMIT 1000;
$$;
