
-- =============================================
-- STATE-BASED ACCESS CONTROL MIGRATION
-- =============================================

-- 1. Add max_states column to subscription_plans (use same values as max_counties for now)
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS max_states integer DEFAULT 5;

-- Update plans with state limits:
-- Starter: 5 states, Professional: 25 states, Enterprise: 0 (unlimited)
UPDATE subscription_plans SET max_states = 5 WHERE name = 'starter';
UPDATE subscription_plans SET max_states = 25 WHERE name = 'professional';
UPDATE subscription_plans SET max_states = 0 WHERE name = 'enterprise'; -- 0 = unlimited

-- 2. Create user_allowed_states table
CREATE TABLE IF NOT EXISTS public.user_allowed_states (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    state text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, state)
);

-- Enable RLS
ALTER TABLE public.user_allowed_states ENABLE ROW LEVEL SECURITY;

-- Users can only see/manage their own states
CREATE POLICY "Users can view their own states" 
ON public.user_allowed_states 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own states" 
ON public.user_allowed_states 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own states" 
ON public.user_allowed_states 
FOR DELETE 
USING (auth.uid() = user_id);

-- 3. Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_allowed_states_user_id ON user_allowed_states(user_id);
CREATE INDEX IF NOT EXISTS idx_user_allowed_states_state ON user_allowed_states(state);

-- 4. Function to get user's allowed states
CREATE OR REPLACE FUNCTION public.fn_get_user_allowed_states(p_user_id uuid DEFAULT NULL)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_states text[];
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());
  
  IF v_user_id IS NULL THEN
    RETURN ARRAY[]::text[];
  END IF;
  
  SELECT ARRAY_AGG(state)
  INTO v_states
  FROM user_allowed_states
  WHERE user_id = v_user_id;
  
  RETURN COALESCE(v_states, ARRAY[]::text[]);
END;
$$;

-- 5. Function to update user's allowed states (respects plan limits)
CREATE OR REPLACE FUNCTION public.fn_update_user_states(p_states text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_max_states integer;
  v_state_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;
  
  -- Get user's state limit from subscription
  SELECT sp.max_states
  INTO v_max_states
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = v_user_id
    AND us.status = 'active'
  LIMIT 1;
  
  -- Default to starter limit
  IF v_max_states IS NULL THEN
    v_max_states := 5;
  END IF;
  
  -- 0 means unlimited (enterprise)
  IF v_max_states > 0 THEN
    v_state_count := COALESCE(array_length(p_states, 1), 0);
    
    IF v_state_count > v_max_states THEN
      RETURN jsonb_build_object(
        'success', false, 
        'error', format('Your plan allows %s states. You selected %s.', v_max_states, v_state_count)
      );
    END IF;
  END IF;
  
  -- Delete existing states
  DELETE FROM user_allowed_states WHERE user_id = v_user_id;
  
  -- Insert new states
  IF p_states IS NOT NULL AND array_length(p_states, 1) > 0 THEN
    INSERT INTO user_allowed_states (user_id, state)
    SELECT v_user_id, unnest(p_states);
  END IF;
  
  RETURN jsonb_build_object('success', true, 'states', p_states);
END;
$$;

-- 6. Check if user needs to select states (for onboarding)
CREATE OR REPLACE FUNCTION public.fn_user_needs_state_selection()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_state_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;
  
  SELECT COUNT(*)
  INTO v_state_count
  FROM user_allowed_states
  WHERE user_id = v_user_id;
  
  RETURN v_state_count = 0;
END;
$$;

-- 7. Updated fn_properties_paged with STATE-BASED filtering
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

  -- Default to starter plan limit if no subscription
  IF v_max_states IS NULL THEN
    SELECT max_states INTO v_max_states
    FROM subscription_plans
    WHERE name = 'starter'
    LIMIT 1;
    
    IF v_max_states IS NULL THEN
      v_max_states := 5;
    END IF;
  END IF;

  -- For limited plans (max_states > 0), get user's allowed states
  -- For unlimited plans (max_states = 0), skip filtering
  IF v_max_states > 0 THEN
    SELECT ARRAY_AGG(state)
    INTO v_allowed_states
    FROM user_allowed_states
    WHERE user_id = v_user_id;
    
    v_has_state_filter := (v_allowed_states IS NOT NULL AND array_length(v_allowed_states, 1) > 0);
  END IF;

  -- Enterprise users (max_states = 0) or users without state selections: show all
  IF v_max_states = 0 OR NOT v_has_state_filter THEN
    -- Unlimited: show all properties
    SELECT COUNT(*)
    INTO v_total
    FROM properties p
    WHERE (p_state IS NULL OR p.state = p_state)
      AND (p_city IS NULL OR p.city ILIKE p_city)
      AND (p_search IS NULL OR p.address ILIKE '%' || p_search || '%')
      AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
      AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max);
  ELSE
    -- Limited: filter by user's allowed states
    SELECT COUNT(*)
    INTO v_total
    FROM properties p
    WHERE (p_state IS NULL OR p.state = p_state)
      AND (p_city IS NULL OR p.city ILIKE p_city)
      AND (p_search IS NULL OR p.address ILIKE '%' || p_search || '%')
      AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
      AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
      AND p.state = ANY(v_allowed_states);
  END IF;

  -- Fetch data
  IF v_max_states = 0 OR NOT v_has_state_filter THEN
    -- Unlimited: fetch all
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
    -- Limited: filter by allowed states
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
        AND p.state = ANY(v_allowed_states)
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
    'has_state_filter', v_has_state_filter
  );
END;
$$;

-- 8. Updated fn_properties_by_bbox with STATE-BASED filtering
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
  v_max_states integer;
  v_allowed_states text[];
  v_items jsonb;
  v_has_state_filter boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'items', '[]'::jsonb,
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

  -- Default to starter plan limit if no subscription
  IF v_max_states IS NULL THEN
    SELECT max_states INTO v_max_states
    FROM subscription_plans
    WHERE name = 'starter'
    LIMIT 1;
    
    IF v_max_states IS NULL THEN
      v_max_states := 5;
    END IF;
  END IF;

  -- For limited plans, get user's allowed states
  IF v_max_states > 0 THEN
    SELECT ARRAY_AGG(state)
    INTO v_allowed_states
    FROM user_allowed_states
    WHERE user_id = v_user_id;
    
    v_has_state_filter := (v_allowed_states IS NOT NULL AND array_length(v_allowed_states, 1) > 0);
  END IF;

  -- Enterprise or no state filter: show all in bbox
  IF v_max_states = 0 OR NOT v_has_state_filter THEN
    SELECT jsonb_agg(row_to_json(props)::jsonb)
    INTO v_items
    FROM (
      SELECT 
        p.id,
        p.address,
        p.city,
        p.state,
        p.zip,
        p.snap_score,
        p.latitude,
        p.longitude,
        p.total_violations,
        p.distress_signals,
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
    -- Limited: filter by allowed states
    SELECT jsonb_agg(row_to_json(props)::jsonb)
    INTO v_items
    FROM (
      SELECT 
        p.id,
        p.address,
        p.city,
        p.state,
        p.zip,
        p.snap_score,
        p.latitude,
        p.longitude,
        p.total_violations,
        p.distress_signals,
        p.opportunity_class
      FROM properties p
      WHERE p.latitude IS NOT NULL 
        AND p.longitude IS NOT NULL
        AND p.latitude BETWEEN p_min_lat AND p_max_lat
        AND p.longitude BETWEEN p_min_lng AND p_max_lng
        AND p.state = ANY(v_allowed_states)
      ORDER BY p.snap_score DESC NULLS LAST
      LIMIT p_limit
    ) props;
  END IF;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'allowed_states', COALESCE(v_allowed_states, ARRAY[]::text[]),
    'has_state_filter', v_has_state_filter
  );
END;
$$;
