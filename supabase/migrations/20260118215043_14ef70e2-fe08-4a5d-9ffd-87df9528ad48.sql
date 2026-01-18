-- =========================================================
-- SECURITY & RELIABILITY FIXES - Part 1: Functions
-- =========================================================

-- 1. Fix fn_check_subscription_limit for unlimited plans (-1)
CREATE OR REPLACE FUNCTION public.fn_check_subscription_limit(
    p_usage_type text, 
    p_amount integer DEFAULT 1, 
    p_user_id uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_subscription record;
    v_usage record;
    v_limit integer;
    v_current integer;
    v_remaining integer;
BEGIN
    -- Get subscription
    SELECT * INTO v_subscription FROM fn_get_user_subscription(p_user_id);
    
    IF v_subscription IS NULL THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'no_subscription',
            'message', 'No active subscription found. Please subscribe to continue.'
        );
    END IF;
    
    SELECT * INTO v_usage FROM fn_get_current_usage(p_user_id);
    
    IF p_usage_type = 'exports' THEN
        v_limit := v_subscription.max_monthly_exports;
        v_current := COALESCE(v_usage.exports_count, 0);
    ELSIF p_usage_type = 'skip_traces' THEN
        v_limit := v_subscription.max_skip_traces_per_month;
        v_current := COALESCE(v_usage.skip_traces_count, 0);
    ELSE
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'invalid_type',
            'message', 'Invalid usage type'
        );
    END IF;
    
    -- CRITICAL FIX: Handle unlimited plans (-1 means unlimited)
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
            'message', format('You have reached your monthly %s limit (%s/%s). Upgrade your plan for more.', p_usage_type, v_current, v_limit),
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
$function$;

-- 5. Create atomic usage function (check + increment in one transaction)
CREATE OR REPLACE FUNCTION public.fn_consume_usage(
    p_usage_type text, 
    p_amount integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_check_result jsonb;
    v_increment_success boolean;
BEGIN
    v_check_result := fn_check_subscription_limit(p_usage_type, p_amount, v_user_id);
    
    IF NOT (v_check_result->>'allowed')::boolean THEN
        RETURN v_check_result;
    END IF;
    
    v_increment_success := fn_increment_usage(p_usage_type, p_amount, v_user_id);
    
    IF NOT v_increment_success THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'increment_failed',
            'message', 'Failed to record usage'
        );
    END IF;
    
    RETURN jsonb_build_object(
        'allowed', true,
        'consumed', p_amount,
        'current', COALESCE((v_check_result->>'current')::int, 0) + p_amount,
        'limit', v_check_result->>'limit',
        'remaining', CASE 
            WHEN v_check_result->>'remaining' IS NULL THEN null
            ELSE GREATEST(0, (v_check_result->>'remaining')::int)
        END,
        'plan_name', v_check_result->>'plan_name',
        'unlimited', COALESCE((v_check_result->>'unlimited')::boolean, false)
    );
END;
$function$;

-- 7. Fix search_path on SECURITY DEFINER functions missing it
DROP FUNCTION IF EXISTS public.fn_bulk_run_inc(text, text);
CREATE FUNCTION public.fn_bulk_run_inc(p_run_id text, p_field text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_field = 'succeeded' THEN
    UPDATE skiptrace_bulk_runs SET succeeded = succeeded + 1 WHERE run_id = p_run_id;
  ELSIF p_field = 'failed' THEN
    UPDATE skiptrace_bulk_runs SET failed = failed + 1 WHERE run_id = p_run_id;
  END IF;
END;
$function$;

DROP FUNCTION IF EXISTS public.fn_properties_untraced_in_list(uuid, integer);
CREATE FUNCTION public.fn_properties_untraced_in_list(p_list_id uuid, p_limit integer DEFAULT 5000)
RETURNS TABLE(property_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT lp.property_id
  FROM public.list_properties lp
  LEFT JOIN public.property_contacts pc ON pc.property_id = lp.property_id
  WHERE lp.list_id = p_list_id
  GROUP BY lp.property_id
  HAVING COUNT(pc.property_id) = 0
  LIMIT p_limit;
$function$;