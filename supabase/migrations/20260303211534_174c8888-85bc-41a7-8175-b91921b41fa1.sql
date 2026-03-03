
DROP FUNCTION IF EXISTS public.fn_start_trial(uuid, text);

CREATE FUNCTION public.fn_start_trial(p_user_id uuid, p_trial_tier text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing record;
  v_plan_id uuid;
BEGIN
  SELECT id, status INTO v_existing
  FROM user_subscriptions
  WHERE user_id = p_user_id
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'subscription_exists');
  END IF;

  SELECT id INTO v_plan_id
  FROM subscription_plans
  WHERE name = p_trial_tier AND is_active = true
  LIMIT 1;

  INSERT INTO user_subscriptions (
    user_id, plan_id, status, trial_started_at, trial_ends_at,
    trial_tier, trial_exports_used, trial_exports_limit,
    current_period_start, current_period_end
  ) VALUES (
    p_user_id, COALESCE(v_plan_id, (SELECT id FROM subscription_plans WHERE is_active = true ORDER BY sort_order LIMIT 1)),
    'trial', now(), now() + interval '7 days',
    p_trial_tier, 0, 25,
    now(), now() + interval '7 days'
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_get_trial_status(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub record;
  v_is_trial boolean;
  v_days_remaining numeric;
BEGIN
  SELECT * INTO v_sub
  FROM user_subscriptions
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_sub IS NULL THEN
    RETURN jsonb_build_object(
      'is_on_trial', false,
      'has_trial_expired', false,
      'has_active_subscription', false,
      'trial_days_remaining', 0,
      'trial_exports_used', 0,
      'trial_exports_remaining', 0,
      'trial_exports_limit', 25,
      'trial_tier', null,
      'trial_ends_at', null,
      'trial_started_at', null,
      'subscription_status', null,
      'can_export', false,
      'plan_id', null
    );
  END IF;

  v_is_trial := v_sub.status IN ('trial', 'trialing');
  v_days_remaining := EXTRACT(EPOCH FROM (v_sub.trial_ends_at - now())) / 86400.0;

  RETURN jsonb_build_object(
    'is_on_trial', v_is_trial AND v_sub.trial_ends_at > now(),
    'has_trial_expired', v_is_trial AND v_sub.trial_ends_at <= now(),
    'has_active_subscription', v_sub.status = 'active',
    'trial_days_remaining', ROUND(v_days_remaining, 1),
    'trial_exports_used', COALESCE(v_sub.trial_exports_used, 0),
    'trial_exports_remaining', GREATEST(0, COALESCE(v_sub.trial_exports_limit, 25) - COALESCE(v_sub.trial_exports_used, 0)),
    'trial_exports_limit', COALESCE(v_sub.trial_exports_limit, 25),
    'trial_tier', v_sub.trial_tier,
    'trial_ends_at', v_sub.trial_ends_at,
    'trial_started_at', v_sub.trial_started_at,
    'subscription_status', v_sub.status,
    'plan_id', v_sub.plan_id,
    'can_export', (v_is_trial AND v_sub.trial_ends_at > now() AND COALESCE(v_sub.trial_exports_used, 0) < COALESCE(v_sub.trial_exports_limit, 25)) OR v_sub.status = 'active'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_increment_trial_exports(p_user_id uuid, p_count integer DEFAULT 1)
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
  WHERE user_id = p_user_id
    AND status IN ('trial', 'trialing')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_sub IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_active_trial');
  END IF;

  IF v_sub.trial_ends_at <= now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'trial_expired');
  END IF;

  IF COALESCE(v_sub.trial_exports_used, 0) + p_count > COALESCE(v_sub.trial_exports_limit, 25) THEN
    RETURN jsonb_build_object('success', false, 'error', 'trial_exports_exhausted', 'used', COALESCE(v_sub.trial_exports_used, 0), 'limit', COALESCE(v_sub.trial_exports_limit, 25));
  END IF;

  v_new_count := COALESCE(v_sub.trial_exports_used, 0) + p_count;

  UPDATE user_subscriptions
  SET trial_exports_used = v_new_count, updated_at = now()
  WHERE id = v_sub.id;

  RETURN jsonb_build_object('success', true, 'used', v_new_count, 'remaining', COALESCE(v_sub.trial_exports_limit, 25) - v_new_count);
END;
$$;

-- Update existing active trial users to the new 25 limit
UPDATE user_subscriptions
SET trial_exports_limit = 25
WHERE status IN ('trial', 'trialing')
  AND trial_exports_limit = 50;
