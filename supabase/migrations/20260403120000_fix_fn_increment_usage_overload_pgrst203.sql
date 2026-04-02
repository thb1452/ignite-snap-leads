-- PGRST203: PostgREST cannot pick between two fn_increment_usage overloads that share
-- the same parameter names (p_user_id, p_usage_type, p_amount) in different orders.
-- That breaks RPC calls (e.g. subscription usage during unlock) with named arguments.
--
-- Keep a single overload: (text, integer, uuid) with defaults so clients can pass
-- only p_usage_type and p_amount; use the secure billing-period logic from the audit fix.

DROP FUNCTION IF EXISTS public.fn_increment_usage(uuid, text, integer);

CREATE OR REPLACE FUNCTION public.fn_increment_usage(
  p_usage_type text,
  p_amount integer DEFAULT 1,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_start date;
  v_period_end date;
BEGIN
  IF p_user_id IS NULL OR p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT current_period_start::date, current_period_end::date
  INTO v_period_start, v_period_end
  FROM user_subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
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

GRANT EXECUTE ON FUNCTION public.fn_increment_usage(text, integer, uuid) TO authenticated;

-- Same ambiguity pattern for limit checks: drop the (uuid, text, int) overload, then
-- ensure the canonical (text, int, uuid) function exists (some DBs only ever had the former).
DROP FUNCTION IF EXISTS public.fn_check_subscription_limit(uuid, text, integer);

CREATE OR REPLACE FUNCTION public.fn_check_subscription_limit(
  p_usage_type text,
  p_amount integer DEFAULT 1,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription record;
  v_usage jsonb;
  v_limit integer;
  v_current integer;
  v_remaining integer;
BEGIN
  SELECT * INTO v_subscription FROM fn_get_user_subscription(p_user_id);

  IF v_subscription IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'no_subscription',
      'message', 'No active subscription found. Please subscribe to continue.'
    );
  END IF;

  v_usage := fn_get_current_usage(p_user_id);

  IF p_usage_type = 'exports' THEN
    v_limit := v_subscription.max_monthly_exports;
    v_current := COALESCE((v_usage->>'exports_count')::int, 0);
  ELSIF p_usage_type = 'skip_traces' THEN
    v_limit := v_subscription.max_skip_traces_per_month;
    v_current := COALESCE((v_usage->>'skip_traces_count')::int, 0);
  ELSE
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'invalid_type',
      'message', 'Invalid usage type'
    );
  END IF;

  IF v_limit = -1 THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'current', v_current,
      'limit', null,
      'remaining', null,
      'plan_name', v_subscription.plan_name,
      'unlimited', true
    );
  END IF;

  v_remaining := v_limit - v_current;

  IF v_current + p_amount > v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'limit_exceeded',
      'message', format(
        'You have reached your monthly %s limit (%s/%s). Upgrade your plan for more.',
        p_usage_type, v_current, v_limit
      ),
      'current', v_current,
      'limit', v_limit,
      'remaining', GREATEST(0, v_remaining),
      'plan_name', v_subscription.plan_name
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'current', v_current,
    'limit', v_limit,
    'remaining', v_remaining - p_amount,
    'plan_name', v_subscription.plan_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_check_subscription_limit(text, integer, uuid) TO authenticated;
