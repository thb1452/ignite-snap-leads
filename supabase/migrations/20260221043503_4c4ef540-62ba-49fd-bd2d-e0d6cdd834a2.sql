
-- CRITICAL FIX 1: fn_start_trial - enforce auth.uid() = p_user_id
CREATE OR REPLACE FUNCTION public.fn_start_trial(p_user_id uuid, p_trial_tier text DEFAULT 'starter')
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
  -- SECURITY: Prevent starting trial for another user
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

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

  INSERT INTO user_subscriptions (
    user_id, plan_id, status, trial_started_at, trial_ends_at,
    trial_tier, trial_exports_used, trial_exports_limit,
    current_period_start, current_period_end
  ) VALUES (
    p_user_id, v_plan_id, 'trial', now(), now() + interval '7 days',
    p_trial_tier, 0, 50, now(), now() + interval '7 days'
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

-- CRITICAL FIX 2: fn_increment_trial_exports - enforce auth.uid() = p_user_id
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
  -- SECURITY: Prevent incrementing exports for another user
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT id, trial_exports_used, trial_exports_limit, trial_ends_at, status
  INTO v_sub
  FROM user_subscriptions
  WHERE user_id = p_user_id AND status IN ('trial', 'trialing')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_sub IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_trial');
  END IF;

  IF v_sub.trial_ends_at IS NOT NULL AND v_sub.trial_ends_at < now() THEN
    UPDATE user_subscriptions SET status = 'expired' WHERE id = v_sub.id;
    RETURN jsonb_build_object('success', false, 'error', 'trial_expired');
  END IF;

  IF COALESCE(v_sub.trial_exports_used, 0) + p_count > COALESCE(v_sub.trial_exports_limit, 50) THEN
    RETURN jsonb_build_object('success', false, 'error', 'trial_exports_exhausted', 'used', COALESCE(v_sub.trial_exports_used, 0), 'limit', COALESCE(v_sub.trial_exports_limit, 50));
  END IF;

  v_new_count := COALESCE(v_sub.trial_exports_used, 0) + p_count;

  UPDATE user_subscriptions
  SET trial_exports_used = v_new_count, updated_at = now()
  WHERE id = v_sub.id;

  RETURN jsonb_build_object('success', true, 'used', v_new_count, 'remaining', COALESCE(v_sub.trial_exports_limit, 50) - v_new_count);
END;
$$;
