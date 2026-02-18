
-- Fix fn_get_trial_status to recognize 'trialing' (Stripe's trial status) alongside 'trial'
CREATE OR REPLACE FUNCTION public.fn_get_trial_status(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sub record;
  v_days_remaining numeric;
  v_is_trial boolean;
BEGIN
  SELECT * INTO v_sub
  FROM user_subscriptions
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_sub IS NULL THEN
    RETURN jsonb_build_object('is_on_trial', false, 'has_trial_expired', false, 'has_active_subscription', false);
  END IF;

  -- Check if user is on trial (support both 'trial' and Stripe's 'trialing')
  v_is_trial := v_sub.status IN ('trial', 'trialing');

  -- Auto-expire trial if past end date
  IF v_is_trial AND v_sub.trial_ends_at IS NOT NULL AND v_sub.trial_ends_at < now() THEN
    UPDATE user_subscriptions SET status = 'expired' WHERE id = v_sub.id;
    v_sub.status := 'expired';
    v_is_trial := false;
  END IF;

  v_days_remaining := GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(v_sub.trial_ends_at, now()) - now())) / 86400);

  RETURN jsonb_build_object(
    'is_on_trial', v_is_trial AND v_sub.trial_ends_at IS NOT NULL AND v_sub.trial_ends_at > now(),
    'has_trial_expired', v_sub.status = 'expired' AND v_sub.trial_started_at IS NOT NULL,
    'has_active_subscription', v_sub.status IN ('active'),
    'trial_days_remaining', ROUND(v_days_remaining, 1),
    'trial_exports_used', COALESCE(v_sub.trial_exports_used, 0),
    'trial_exports_remaining', GREATEST(0, COALESCE(v_sub.trial_exports_limit, 50) - COALESCE(v_sub.trial_exports_used, 0)),
    'trial_exports_limit', COALESCE(v_sub.trial_exports_limit, 50),
    'trial_tier', v_sub.trial_tier,
    'trial_ends_at', v_sub.trial_ends_at,
    'trial_started_at', v_sub.trial_started_at,
    'subscription_status', v_sub.status,
    'plan_id', v_sub.plan_id,
    'can_export', (v_is_trial AND v_sub.trial_ends_at > now() AND COALESCE(v_sub.trial_exports_used, 0) < COALESCE(v_sub.trial_exports_limit, 50)) OR v_sub.status = 'active'
  );
END;
$function$;

-- Fix fn_increment_trial_exports to recognize 'trialing' status
CREATE OR REPLACE FUNCTION public.fn_increment_trial_exports(p_user_id uuid, p_count integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
