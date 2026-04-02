-- Align subscription unlock limits with the app UI (trialing / trial / past_due / active).
-- Previously fn_check_subscription_limit(uuid, text, int) only matched status = 'active', so
-- subscribers in trial/trialing fell through to wrong limits; fn_increment_usage and
-- fn_get_current_usage also used narrower status filters, skewing usage vs the UI.

CREATE OR REPLACE FUNCTION public.fn_check_subscription_limit(
  p_user_id uuid,
  p_usage_type text,
  p_amount integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_limit integer;
  v_current_count integer;
  v_remaining integer;
  v_plan_name text;
  v_period_start date;
BEGIN
  SELECT
    sp.max_monthly_exports,
    sp.display_name,
    us.current_period_start::date
  INTO v_max_limit, v_plan_name, v_period_start
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = p_user_id
    AND us.status IN ('active', 'trialing', 'trial', 'past_due')
  ORDER BY us.created_at DESC
  LIMIT 1;

  IF v_max_limit IS NULL THEN
    SELECT max_monthly_exports, display_name
    INTO v_max_limit, v_plan_name
    FROM subscription_plans
    WHERE name = 'starter'
    LIMIT 1;

    v_period_start := date_trunc('month', CURRENT_DATE)::date;
  END IF;

  IF v_max_limit IS NULL THEN
    v_max_limit := 0;
    v_plan_name := 'Free';
    v_period_start := date_trunc('month', CURRENT_DATE)::date;
  END IF;

  IF v_max_limit = -1 THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'reason', 'unlimited',
      'message', 'Unlimited usage allowed',
      'current', 0,
      'limit', -1,
      'remaining', NULL,
      'plan_name', v_plan_name
    );
  END IF;

  SELECT
    CASE
      WHEN p_usage_type = 'exports' THEN COALESCE(exports_count, 0)
      WHEN p_usage_type = 'api_calls' THEN COALESCE(api_calls_count, 0)
      ELSE 0
    END
  INTO v_current_count
  FROM subscription_usage
  WHERE user_id = p_user_id
    AND period_start = v_period_start;

  IF v_current_count IS NULL THEN
    v_current_count := 0;
  END IF;

  v_remaining := v_max_limit - v_current_count;

  IF v_current_count + p_amount > v_max_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'limit_exceeded',
      'message', format(
        '%s limit reached. Your %s plan allows %s per month. You have used %s.',
        initcap(p_usage_type),
        v_plan_name,
        v_max_limit,
        v_current_count
      ),
      'current', v_current_count,
      'limit', v_max_limit,
      'remaining', GREATEST(0, v_remaining),
      'plan_name', v_plan_name
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'reason', 'within_limit',
    'message', format('%s of %s %s used', v_current_count, v_max_limit, p_usage_type),
    'current', v_current_count,
    'limit', v_max_limit,
    -- After consuming p_amount for this unlock (matches fn_check_subscription_limit text,uuid overload)
    'remaining', v_remaining - p_amount,
    'plan_name', v_plan_name
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_increment_usage(p_user_id uuid, p_usage_type text, p_amount integer DEFAULT 1)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_start date;
  v_period_end date;
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT current_period_start::date, current_period_end::date
  INTO v_period_start, v_period_end
  FROM user_subscriptions
  WHERE user_id = p_user_id
    AND status IN ('active', 'trialing', 'trial', 'past_due')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_period_start IS NULL THEN
    v_period_start := date_trunc('month', CURRENT_DATE)::date;
    v_period_end := (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date;
  END IF;

  INSERT INTO subscription_usage (user_id, period_start, period_end)
  VALUES (p_user_id, v_period_start, v_period_end)
  ON CONFLICT (user_id, period_start) DO NOTHING;

  IF p_usage_type = 'exports' THEN
    UPDATE subscription_usage
    SET exports_count = exports_count + p_amount, updated_at = NOW()
    WHERE user_id = p_user_id AND period_start = v_period_start;
  ELSIF p_usage_type = 'skip_traces' THEN
    UPDATE subscription_usage
    SET skip_traces_count = skip_traces_count + p_amount, updated_at = NOW()
    WHERE user_id = p_user_id AND period_start = v_period_start;
  ELSIF p_usage_type = 'api_calls' THEN
    UPDATE subscription_usage
    SET api_calls_count = api_calls_count + p_amount, updated_at = NOW()
    WHERE user_id = p_user_id AND period_start = v_period_start;
  ELSE
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

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
    AND status IN ('active', 'trialing', 'trial', 'past_due')
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
