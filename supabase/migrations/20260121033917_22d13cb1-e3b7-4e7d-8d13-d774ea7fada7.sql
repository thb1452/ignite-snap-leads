-- =====================================================
-- COUNTY LIMIT CHECK FUNCTION
-- Used by the frontend to validate county assignments
-- against subscription plan limits
-- =====================================================

CREATE OR REPLACE FUNCTION public.fn_check_county_limit(p_amount integer DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_max_counties integer;
  v_current_count integer;
  v_remaining integer;
  v_plan_name text;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'not_authenticated',
      'message', 'Authentication required'
    );
  END IF;
  
  -- Get user's subscription limits
  SELECT sp.max_counties, sp.display_name
  INTO v_max_counties, v_plan_name
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = v_user_id
    AND us.status = 'active'
  LIMIT 1;
  
  -- Default to starter plan limits if no subscription found
  IF v_max_counties IS NULL THEN
    SELECT sp.max_counties, sp.display_name
    INTO v_max_counties, v_plan_name
    FROM subscription_plans sp
    WHERE sp.name = 'starter'
    LIMIT 1;
  END IF;
  
  -- Fallback if no plan found at all
  IF v_max_counties IS NULL THEN
    v_max_counties := 5;
    v_plan_name := 'Free';
  END IF;
  
  -- -1 means unlimited
  IF v_max_counties = -1 THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'reason', 'unlimited',
      'message', 'Unlimited counties allowed',
      'current', 0,
      'limit', -1,
      'remaining', -1,
      'plan_name', v_plan_name
    );
  END IF;
  
  -- Count currently assigned counties (organization-wide)
  SELECT COUNT(*)
  INTO v_current_count
  FROM counties
  WHERE assigned_to IS NOT NULL;
  
  v_remaining := v_max_counties - v_current_count;
  
  IF v_current_count + p_amount > v_max_counties THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'limit_exceeded',
      'message', format('County limit reached. Your %s plan allows %s counties. You have %s assigned.', 
                       v_plan_name, v_max_counties, v_current_count),
      'current', v_current_count,
      'limit', v_max_counties,
      'remaining', GREATEST(0, v_remaining),
      'plan_name', v_plan_name
    );
  END IF;
  
  RETURN jsonb_build_object(
    'allowed', true,
    'reason', 'within_limit',
    'message', format('%s of %s counties used', v_current_count, v_max_counties),
    'current', v_current_count,
    'limit', v_max_counties,
    'remaining', v_remaining,
    'plan_name', v_plan_name
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.fn_check_county_limit(integer) TO authenticated;