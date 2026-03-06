-- Fix fn_get_user_subscription: add 'past_due' status
CREATE OR REPLACE FUNCTION public.fn_get_user_subscription(p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE(
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
STABLE SECURITY DEFINER
SET search_path TO 'public'
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
    AND p_user_id = auth.uid()
    AND s.status IN ('active', 'trialing', 'trial', 'past_due')
  ORDER BY s.created_at DESC
  LIMIT 1;
$$;

-- Fix fn_get_current_usage: add auth.uid() security check
CREATE OR REPLACE FUNCTION public.fn_get_current_usage(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_exports_count integer;
  v_api_calls_count integer;
  v_period_start timestamp with time zone;
  v_period_end timestamp with time zone;
BEGIN
  IF p_user_id != auth.uid() THEN
    RETURN jsonb_build_object(
      'exports_count', 0,
      'api_calls_count', 0,
      'period_start', date_trunc('month', CURRENT_DATE),
      'period_end', (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')
    );
  END IF;

  SELECT current_period_start, current_period_end
  INTO v_period_start, v_period_end
  FROM user_subscriptions
  WHERE user_id = p_user_id
    AND status IN ('active', 'past_due')
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF v_period_start IS NULL THEN
    v_period_start := date_trunc('month', CURRENT_DATE);
    v_period_end := (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::timestamp with time zone;
  END IF;
  
  SELECT COALESCE(exports_count, 0), COALESCE(api_calls_count, 0)
  INTO v_exports_count, v_api_calls_count
  FROM subscription_usage
  WHERE user_id = p_user_id
    AND period_start = v_period_start::date;
  
  IF v_exports_count IS NULL THEN
    v_exports_count := 0;
    v_api_calls_count := 0;
  END IF;
  
  RETURN jsonb_build_object(
    'exports_count', v_exports_count,
    'api_calls_count', v_api_calls_count,
    'period_start', v_period_start,
    'period_end', v_period_end
  );
END;
$$;

-- Fix fn_get_trial_status: add auth.uid() check + past_due support
CREATE OR REPLACE FUNCTION public.fn_get_trial_status(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sub record;
  v_is_trial boolean;
  v_days_remaining numeric;
BEGIN
  IF p_user_id != auth.uid() THEN
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
    'has_active_subscription', v_sub.status IN ('active', 'past_due'),
    'trial_days_remaining', ROUND(v_days_remaining, 1),
    'trial_exports_used', COALESCE(v_sub.trial_exports_used, 0),
    'trial_exports_remaining', GREATEST(0, COALESCE(v_sub.trial_exports_limit, 25) - COALESCE(v_sub.trial_exports_used, 0)),
    'trial_exports_limit', COALESCE(v_sub.trial_exports_limit, 25),
    'trial_tier', v_sub.trial_tier,
    'trial_ends_at', v_sub.trial_ends_at,
    'trial_started_at', v_sub.trial_started_at,
    'subscription_status', v_sub.status,
    'plan_id', v_sub.plan_id,
    'can_export', (v_is_trial AND v_sub.trial_ends_at > now() AND COALESCE(v_sub.trial_exports_used, 0) < COALESCE(v_sub.trial_exports_limit, 25)) OR v_sub.status IN ('active', 'past_due')
  );
END;
$$;