
DROP FUNCTION IF EXISTS public.fn_start_trial(uuid, text);

CREATE FUNCTION public.fn_start_trial(p_user_id uuid, p_trial_tier text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id uuid;
  v_existing record;
BEGIN
  -- Security: only the authenticated user can start their own trial
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Check for existing subscription
  SELECT id, subscription_status, trial_started_at
  INTO v_existing
  FROM user_subscriptions
  WHERE user_id = p_user_id
  LIMIT 1;

  -- Block if already has active/trialing subscription
  IF v_existing.id IS NOT NULL AND v_existing.subscription_status IN ('active', 'trial', 'trialing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already has active subscription or trial');
  END IF;

  -- Block if already used a trial before
  IF v_existing.trial_started_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Trial already used');
  END IF;

  -- Resolve plan
  SELECT id INTO v_plan_id FROM subscription_plans WHERE name = p_trial_tier AND is_active = true LIMIT 1;

  -- Delete stale record if exists (expired/cancelled)
  IF v_existing.id IS NOT NULL THEN
    DELETE FROM user_subscriptions WHERE id = v_existing.id;
  END IF;

  -- Insert new trial subscription (3-day trial)
  INSERT INTO user_subscriptions (
    user_id, plan_id, subscription_status, trial_started_at, trial_ends_at,
    trial_tier, trial_exports_used, trial_exports_limit,
    current_period_start, current_period_end
  ) VALUES (
    p_user_id, COALESCE(v_plan_id, (SELECT id FROM subscription_plans WHERE is_active = true ORDER BY sort_order LIMIT 1)),
    'trial', now(), now() + interval '3 days',
    p_trial_tier, 0, 25,
    now(), now() + interval '3 days'
  );

  RETURN jsonb_build_object(
    'success', true,
    'trial_ends_at', (now() + interval '3 days')::text,
    'trial_tier', p_trial_tier
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_start_trial(uuid, text) TO authenticated;
