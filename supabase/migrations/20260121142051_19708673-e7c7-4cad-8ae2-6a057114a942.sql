
-- Fix fn_check_subscription_limit to handle jsonb from fn_get_current_usage
CREATE OR REPLACE FUNCTION public.fn_check_subscription_limit(p_usage_type text, p_amount integer DEFAULT 1, p_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_subscription record;
    v_usage jsonb;
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
    
    -- Get usage as jsonb
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
