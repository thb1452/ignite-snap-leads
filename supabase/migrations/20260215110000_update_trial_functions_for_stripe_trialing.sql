-- ===================================================================
-- Update trial functions to handle Stripe's 'trialing' status
-- ===================================================================
-- With the credit-card-required trial flow, Stripe sets the
-- subscription status to 'trialing' instead of our custom 'trial'.
-- These functions need to handle both statuses.

-- 1. Update fn_get_trial_status to handle 'trialing' status
CREATE OR REPLACE FUNCTION public.fn_get_trial_status(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub record;
  v_days_remaining numeric;
  v_is_on_trial boolean;
BEGIN
  SELECT * INTO v_sub
  FROM user_subscriptions
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_sub IS NULL THEN
    RETURN jsonb_build_object('is_on_trial', false, 'has_trial_expired', false, 'has_active_subscription', false);
  END IF;

  -- Auto-expire trial if past end date (applies to both 'trial' and 'trialing')
  IF v_sub.status IN ('trial', 'trialing') AND v_sub.trial_ends_at IS NOT NULL AND v_sub.trial_ends_at < now() THEN
    UPDATE user_subscriptions SET status = 'expired' WHERE id = v_sub.id;
    v_sub.status := 'expired';
  END IF;

  v_days_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_sub.trial_ends_at - now())) / 86400);

  -- A user is "on trial" if status is 'trial' or 'trialing' and trial hasn't expired
  v_is_on_trial := v_sub.status IN ('trial', 'trialing')
    AND v_sub.trial_ends_at IS NOT NULL
    AND v_sub.trial_ends_at > now();

  RETURN jsonb_build_object(
    'is_on_trial', v_is_on_trial,
    'has_trial_expired', v_sub.status = 'expired' AND v_sub.trial_started_at IS NOT NULL,
    'has_active_subscription', v_sub.status IN ('active', 'trialing'),
    'trial_days_remaining', ROUND(v_days_remaining, 1),
    'trial_exports_used', COALESCE(v_sub.trial_exports_used, 0),
    'trial_exports_remaining', GREATEST(0, COALESCE(v_sub.trial_exports_limit, 50) - COALESCE(v_sub.trial_exports_used, 0)),
    'trial_exports_limit', COALESCE(v_sub.trial_exports_limit, 50),
    'trial_tier', v_sub.trial_tier,
    'trial_ends_at', v_sub.trial_ends_at,
    'trial_started_at', v_sub.trial_started_at,
    'subscription_status', v_sub.status,
    'plan_id', v_sub.plan_id,
    'can_export', (v_is_on_trial AND COALESCE(v_sub.trial_exports_used, 0) < COALESCE(v_sub.trial_exports_limit, 50)) OR v_sub.status IN ('active', 'trialing')
  );
END;
$$;

-- 2. Update fn_increment_trial_exports to handle 'trialing' status
CREATE OR REPLACE FUNCTION public.fn_increment_trial_exports(
  p_user_id uuid,
  p_count integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub record;
  v_new_count integer;
BEGIN
  SELECT id, trial_exports_used, trial_exports_limit, trial_ends_at, status
  INTO v_sub
  FROM user_subscriptions
  WHERE user_id = p_user_id AND status IN ('trial', 'trialing')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_sub IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_trial');
  END IF;

  IF v_sub.trial_ends_at < now() THEN
    -- Auto-expire the trial
    UPDATE user_subscriptions SET status = 'expired' WHERE id = v_sub.id;
    RETURN jsonb_build_object('success', false, 'error', 'trial_expired');
  END IF;

  IF v_sub.trial_exports_used + p_count > v_sub.trial_exports_limit THEN
    RETURN jsonb_build_object('success', false, 'error', 'trial_exports_exhausted', 'used', v_sub.trial_exports_used, 'limit', v_sub.trial_exports_limit);
  END IF;

  v_new_count := v_sub.trial_exports_used + p_count;

  UPDATE user_subscriptions
  SET trial_exports_used = v_new_count, updated_at = now()
  WHERE id = v_sub.id;

  RETURN jsonb_build_object('success', true, 'used', v_new_count, 'remaining', v_sub.trial_exports_limit - v_new_count);
END;
$$;

-- 3. Update fn_start_trial to also check for 'trialing' status
CREATE OR REPLACE FUNCTION public.fn_start_trial(
  p_user_id uuid,
  p_trial_tier text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_trial record;
  v_plan_id uuid;
  v_sub_id uuid;
BEGIN
  -- Check if user already has a subscription or trial
  SELECT id, status, trial_started_at INTO v_existing_trial
  FROM user_subscriptions
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_trial IS NOT NULL AND v_existing_trial.status IN ('active', 'trialing', 'trial') THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_has_subscription');
  END IF;

  IF v_existing_trial IS NOT NULL AND v_existing_trial.trial_started_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_had_trial');
  END IF;

  -- Get the plan_id for the selected tier
  SELECT id INTO v_plan_id
  FROM subscription_plans
  WHERE name = p_trial_tier AND is_active = true
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    SELECT id INTO v_plan_id
    FROM subscription_plans
    WHERE name = 'starter' AND is_active = true
    LIMIT 1;
  END IF;

  IF v_plan_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_plan_found');
  END IF;

  -- Create the trial subscription
  INSERT INTO user_subscriptions (
    user_id,
    plan_id,
    status,
    trial_started_at,
    trial_ends_at,
    trial_tier,
    trial_exports_used,
    trial_exports_limit,
    current_period_start,
    current_period_end
  ) VALUES (
    p_user_id,
    v_plan_id,
    'trial',
    now(),
    now() + interval '7 days',
    p_trial_tier,
    0,
    50,
    now(),
    now() + interval '7 days'
  )
  RETURNING id INTO v_sub_id;

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', v_sub_id,
    'trial_ends_at', (now() + interval '7 days')::text,
    'trial_tier', p_trial_tier
  );
END;
$$;

-- Ensure grants
GRANT EXECUTE ON FUNCTION public.fn_start_trial(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_increment_trial_exports(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_trial_status(uuid) TO authenticated;
