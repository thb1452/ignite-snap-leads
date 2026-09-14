-- Verified against live function definitions on 2026-09-14. Abort on drift.
DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.fn_check_unlocked_batch(uuid,uuid[])'::regprocedure)) IS DISTINCT FROM 'a7d5c9d63527899e54dd1c2f2ee24ac5' THEN
    RAISE EXCEPTION 'Baseline drift: fn_check_unlocked_batch';
  END IF;
  IF md5(pg_get_functiondef('public.fn_consume_usage_atomic(text,integer)'::regprocedure)) IS DISTINCT FROM '08bcffde842cd6b51e40ef27ae1fa969' THEN
    RAISE EXCEPTION 'Baseline drift: fn_consume_usage_atomic';
  END IF;
  IF md5(pg_get_functiondef('public.fn_get_current_usage(uuid)'::regprocedure)) IS DISTINCT FROM '20633d72b657df55c8805404a74f9d61' THEN
    RAISE EXCEPTION 'Baseline drift: fn_get_current_usage';
  END IF;
  IF md5(pg_get_functiondef('public.fn_increment_usage(text,integer,uuid)'::regprocedure)) IS DISTINCT FROM 'db0fcf9ebcc57ddaac9cb7af5faa23e5' THEN
    RAISE EXCEPTION 'Baseline drift: fn_increment_usage';
  END IF;
END;
$guard$;

-- Candidate only; no production execution performed by this review.
-- Existing reads for the caller remain supported. Caller-selected account IDs
-- never authorize SECURITY DEFINER access, including null/anonymous sessions.
CREATE OR REPLACE FUNCTION public.fn_check_unlocked_batch(p_user_id uuid, p_property_ids uuid[])
RETURNS TABLE(property_id uuid)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Account access denied' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT up.property_id FROM public.unlocked_properties up
    WHERE up.user_id = auth.uid() AND up.property_id = ANY(p_property_ids);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_get_current_usage(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exports_count integer;
  v_api_calls_count integer;
  v_period_start timestamp with time zone;
  v_period_end timestamp with time zone;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Account access denied' USING ERRCODE = '42501';
  END IF;

  -- Get actual subscription period
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
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_check_unlocked_batch(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_get_current_usage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_check_unlocked_batch(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_current_usage(uuid) TO authenticated;

-- Candidate only. Uses the existing atomic update and quota values.
CREATE OR REPLACE FUNCTION public.fn_consume_usage_atomic(p_usage_type text, p_amount integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_period_start date;
  v_period_end date;
  v_max_limit integer;
  v_plan_name text;
  v_new_count integer;
  v_old_count integer;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_amount', 'message', 'Usage amount must be positive');
  END IF;
  IF p_usage_type IS NULL OR p_usage_type NOT IN ('exports', 'skip_traces') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_type', 'message', 'Invalid usage type');
  END IF;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'not_authenticated',
      'message', 'Authentication required'
    );
  END IF;

  -- Get billing period and limits from subscription
  SELECT 
    us.current_period_start::date,
    us.current_period_end::date,
    CASE 
      WHEN p_usage_type = 'exports' THEN sp.max_monthly_exports
      WHEN p_usage_type = 'skip_traces' THEN sp.max_skip_traces_per_month
      ELSE 0
    END,
    sp.display_name
  INTO v_period_start, v_period_end, v_max_limit, v_plan_name
  FROM (
    SELECT * FROM public.user_subscriptions
    WHERE user_id = v_user_id
    ORDER BY created_at DESC
    LIMIT 1
  ) us
  JOIN public.subscription_plans sp ON sp.id = us.plan_id
  WHERE us.status = 'active'
    AND us.current_period_start <= now()
    AND us.current_period_end > now();

  -- Missing, future, or expired subscription periods never receive fallback quota.
  IF v_period_start IS NULL OR v_period_end IS NULL OR v_max_limit IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'no_current_subscription',
      'message', 'A current subscription period is required'
    );
  END IF;

  -- Handle unlimited plans (-1 means unlimited)
  IF v_max_limit = -1 THEN
    -- Still track usage for unlimited plans, just don't enforce
    INSERT INTO subscription_usage (user_id, period_start, period_end)
    VALUES (v_user_id, v_period_start, v_period_end)
    ON CONFLICT (user_id, period_start) DO NOTHING;
    
    IF p_usage_type = 'exports' THEN
      UPDATE subscription_usage
      SET exports_count = exports_count + p_amount, updated_at = now()
      WHERE user_id = v_user_id AND period_start = v_period_start
      RETURNING exports_count INTO v_new_count;
    ELSIF p_usage_type = 'skip_traces' THEN
      UPDATE subscription_usage
      SET skip_traces_count = skip_traces_count + p_amount, updated_at = now()
      WHERE user_id = v_user_id AND period_start = v_period_start
      RETURNING skip_traces_count INTO v_new_count;
    END IF;
    
    RETURN jsonb_build_object(
      'allowed', true,
      'consumed', p_amount,
      'current', COALESCE(v_new_count, p_amount),
      'limit', null,
      'remaining', null,
      'plan_name', v_plan_name,
      'unlimited', true
    );
  END IF;

  -- Ensure usage record exists
  INSERT INTO subscription_usage (user_id, period_start, period_end)
  VALUES (v_user_id, v_period_start, v_period_end)
  ON CONFLICT (user_id, period_start) DO NOTHING;

  -- ATOMIC CHECK-AND-INCREMENT
  -- This is the key fix: single UPDATE with WHERE clause that checks limit
  IF p_usage_type = 'exports' THEN
    UPDATE subscription_usage
    SET exports_count = exports_count + p_amount, updated_at = now()
    WHERE user_id = v_user_id 
      AND period_start = v_period_start
      AND exports_count + p_amount <= v_max_limit
    RETURNING exports_count, exports_count - p_amount INTO v_new_count, v_old_count;
  ELSIF p_usage_type = 'skip_traces' THEN
    UPDATE subscription_usage
    SET skip_traces_count = skip_traces_count + p_amount, updated_at = now()
    WHERE user_id = v_user_id 
      AND period_start = v_period_start
      AND skip_traces_count + p_amount <= v_max_limit
    RETURNING skip_traces_count, skip_traces_count - p_amount INTO v_new_count, v_old_count;
  ELSE
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'invalid_type',
      'message', 'Invalid usage type'
    );
  END IF;

  -- If UPDATE didn't match any rows, the limit was exceeded
  IF v_new_count IS NULL THEN
    -- Get current count for error message
    SELECT 
      CASE 
        WHEN p_usage_type = 'exports' THEN exports_count
        WHEN p_usage_type = 'skip_traces' THEN skip_traces_count
        ELSE 0
      END
    INTO v_old_count
    FROM subscription_usage
    WHERE user_id = v_user_id AND period_start = v_period_start;
    
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'limit_exceeded',
      'message', format('You have reached your monthly %s limit (%s/%s). Upgrade your plan for more.', 
                       p_usage_type, COALESCE(v_old_count, 0), v_max_limit),
      'current', COALESCE(v_old_count, 0),
      'limit', v_max_limit,
      'remaining', 0,
      'plan_name', v_plan_name
    );
  END IF;

  -- Success!
  RETURN jsonb_build_object(
    'allowed', true,
    'consumed', p_amount,
    'current', v_new_count,
    'limit', v_max_limit,
    'remaining', GREATEST(0, v_max_limit - v_new_count),
    'plan_name', v_plan_name
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_consume_usage_atomic(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_consume_usage_atomic(text, integer) TO authenticated;


-- Candidate only. Preserve existing accounting behavior; block counter subtraction
-- and absent or mismatched caller identity at this legacy entry point.
CREATE OR REPLACE FUNCTION public.fn_increment_usage(p_usage_type text, p_amount integer DEFAULT 1, p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period_start date;
  v_period_end date;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Usage amount must be positive' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
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
$function$;
