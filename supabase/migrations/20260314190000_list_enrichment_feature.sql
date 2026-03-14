-- =====================================================
-- LIST ENRICHMENT FEATURE - Schema Changes
-- =====================================================
-- 1. Add enrichment limit to subscription_plans
-- 2. Add enrichment counter to subscription_usage
-- 3. Add trial enrichment tracking to user_subscriptions
-- 4. Create enrichment_jobs table
-- 5. Create RPC functions for enrichment usage

-- =====================================================
-- 1. Extend subscription_plans with enrichment limit
-- =====================================================
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS max_enrichment_addresses integer NOT NULL DEFAULT 0;

-- Set limits per plan: starter=10000, professional=50000, enterprise=-1 (unlimited)
UPDATE public.subscription_plans SET max_enrichment_addresses = 10000 WHERE name = 'starter';
UPDATE public.subscription_plans SET max_enrichment_addresses = 50000 WHERE name = 'professional';
UPDATE public.subscription_plans SET max_enrichment_addresses = -1 WHERE name = 'enterprise';

-- =====================================================
-- 2. Extend subscription_usage with enrichment counter
-- =====================================================
ALTER TABLE public.subscription_usage
  ADD COLUMN IF NOT EXISTS enrichment_addresses_count integer NOT NULL DEFAULT 0;

-- =====================================================
-- 3. Extend user_subscriptions with trial enrichment tracking
-- =====================================================
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS trial_enrichment_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trial_enrichment_limit integer NOT NULL DEFAULT 500;

-- =====================================================
-- 4. Create enrichment_jobs table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.enrichment_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  file_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  total_rows integer NOT NULL DEFAULT 0,
  processed_rows integer NOT NULL DEFAULT 0,
  matched_rows integer NOT NULL DEFAULT 0,
  addresses_charged integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.enrichment_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own enrichment jobs"
  ON public.enrichment_jobs
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own enrichment jobs"
  ON public.enrichment_jobs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage enrichment jobs"
  ON public.enrichment_jobs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- 5. RPC: Check enrichment limit (trial + paid)
-- =====================================================
CREATE OR REPLACE FUNCTION public.fn_check_enrichment_limit(
  p_user_id uuid,
  p_address_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sub record;
  v_is_trial boolean;
  v_plan record;
  v_usage record;
  v_max_limit integer;
  v_current_used integer;
  v_remaining integer;
BEGIN
  -- Security check
  IF p_user_id != auth.uid() THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'unauthorized', 'message', 'Unauthorized');
  END IF;

  -- Get subscription
  SELECT * INTO v_sub
  FROM user_subscriptions
  WHERE user_id = p_user_id
    AND status IN ('active', 'trialing', 'past_due', 'trial')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_sub IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'no_subscription',
      'message', 'No active subscription found. Please subscribe to use list enrichment.'
    );
  END IF;

  v_is_trial := v_sub.status IN ('trial', 'trialing');

  -- Check if trial has expired
  IF v_is_trial AND v_sub.trial_ends_at IS NOT NULL AND v_sub.trial_ends_at <= now() THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'trial_expired',
      'message', 'Your trial has expired. Please upgrade to continue using list enrichment.'
    );
  END IF;

  IF v_is_trial THEN
    -- Trial: lifetime limit
    v_current_used := COALESCE(v_sub.trial_enrichment_used, 0);
    v_max_limit := COALESCE(v_sub.trial_enrichment_limit, 500);
    v_remaining := GREATEST(0, v_max_limit - v_current_used);

    IF p_address_count > v_remaining THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'trial_limit_exceeded',
        'message', format('This file contains %s addresses, but you only have %s enrichment credits remaining. Please upgrade or upload a smaller file.', p_address_count, v_remaining),
        'current', v_current_used,
        'limit', v_max_limit,
        'remaining', v_remaining,
        'is_trial', true
      );
    END IF;

    RETURN jsonb_build_object(
      'allowed', true,
      'current', v_current_used,
      'limit', v_max_limit,
      'remaining', v_remaining,
      'is_trial', true
    );
  ELSE
    -- Paid plan: monthly limit
    SELECT max_enrichment_addresses INTO v_max_limit
    FROM subscription_plans
    WHERE id = v_sub.plan_id;

    -- Unlimited
    IF v_max_limit = -1 THEN
      RETURN jsonb_build_object(
        'allowed', true,
        'current', 0,
        'limit', null,
        'remaining', null,
        'unlimited', true,
        'is_trial', false
      );
    END IF;

    -- Get current period usage
    SELECT COALESCE(enrichment_addresses_count, 0) INTO v_current_used
    FROM subscription_usage
    WHERE user_id = p_user_id
      AND period_start = v_sub.current_period_start::date;

    v_current_used := COALESCE(v_current_used, 0);
    v_remaining := GREATEST(0, v_max_limit - v_current_used);

    IF p_address_count > v_remaining THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'limit_exceeded',
        'message', format('This file contains %s addresses, but you only have %s enrichment credits remaining this month. Please upgrade or upload a smaller file.', p_address_count, v_remaining),
        'current', v_current_used,
        'limit', v_max_limit,
        'remaining', v_remaining,
        'is_trial', false
      );
    END IF;

    RETURN jsonb_build_object(
      'allowed', true,
      'current', v_current_used,
      'limit', v_max_limit,
      'remaining', v_remaining,
      'is_trial', false
    );
  END IF;
END;
$function$;

-- =====================================================
-- 6. RPC: Consume enrichment usage atomically
-- =====================================================
CREATE OR REPLACE FUNCTION public.fn_consume_enrichment_usage(
  p_user_id uuid,
  p_address_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sub record;
  v_is_trial boolean;
  v_max_limit integer;
  v_new_count integer;
  v_old_count integer;
  v_period_start date;
  v_period_end date;
BEGIN
  -- Security check
  IF p_user_id != auth.uid() THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'unauthorized', 'message', 'Unauthorized');
  END IF;

  -- Get subscription with row lock
  SELECT * INTO v_sub
  FROM user_subscriptions
  WHERE user_id = p_user_id
    AND status IN ('active', 'trialing', 'past_due', 'trial')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_sub IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_subscription', 'message', 'No active subscription');
  END IF;

  v_is_trial := v_sub.status IN ('trial', 'trialing');

  IF v_is_trial THEN
    -- Trial: atomic check-and-increment on user_subscriptions
    v_old_count := COALESCE(v_sub.trial_enrichment_used, 0);

    IF v_old_count + p_address_count > COALESCE(v_sub.trial_enrichment_limit, 500) THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'trial_limit_exceeded',
        'message', 'Trial enrichment limit exceeded',
        'current', v_old_count,
        'limit', COALESCE(v_sub.trial_enrichment_limit, 500),
        'remaining', GREATEST(0, COALESCE(v_sub.trial_enrichment_limit, 500) - v_old_count)
      );
    END IF;

    UPDATE user_subscriptions
    SET trial_enrichment_used = COALESCE(trial_enrichment_used, 0) + p_address_count,
        updated_at = now()
    WHERE id = v_sub.id
      AND COALESCE(trial_enrichment_used, 0) + p_address_count <= COALESCE(trial_enrichment_limit, 500)
    RETURNING trial_enrichment_used INTO v_new_count;

    IF v_new_count IS NULL THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'trial_limit_exceeded', 'message', 'Concurrent request exceeded trial limit');
    END IF;

    RETURN jsonb_build_object(
      'allowed', true,
      'consumed', p_address_count,
      'current', v_new_count,
      'limit', COALESCE(v_sub.trial_enrichment_limit, 500),
      'remaining', GREATEST(0, COALESCE(v_sub.trial_enrichment_limit, 500) - v_new_count),
      'is_trial', true
    );
  ELSE
    -- Paid plan
    SELECT max_enrichment_addresses INTO v_max_limit
    FROM subscription_plans
    WHERE id = v_sub.plan_id;

    v_period_start := COALESCE(v_sub.current_period_start::date, date_trunc('month', CURRENT_DATE)::date);
    v_period_end := COALESCE(v_sub.current_period_end::date, (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date);

    -- Ensure usage record exists
    INSERT INTO subscription_usage (user_id, period_start, period_end)
    VALUES (p_user_id, v_period_start, v_period_end)
    ON CONFLICT (user_id, period_start) DO NOTHING;

    -- Unlimited plan
    IF v_max_limit = -1 THEN
      UPDATE subscription_usage
      SET enrichment_addresses_count = enrichment_addresses_count + p_address_count, updated_at = now()
      WHERE user_id = p_user_id AND period_start = v_period_start
      RETURNING enrichment_addresses_count INTO v_new_count;

      RETURN jsonb_build_object(
        'allowed', true,
        'consumed', p_address_count,
        'current', COALESCE(v_new_count, p_address_count),
        'limit', null,
        'remaining', null,
        'unlimited', true,
        'is_trial', false
      );
    END IF;

    -- Atomic check-and-increment
    UPDATE subscription_usage
    SET enrichment_addresses_count = enrichment_addresses_count + p_address_count, updated_at = now()
    WHERE user_id = p_user_id
      AND period_start = v_period_start
      AND enrichment_addresses_count + p_address_count <= v_max_limit
    RETURNING enrichment_addresses_count INTO v_new_count;

    IF v_new_count IS NULL THEN
      SELECT enrichment_addresses_count INTO v_old_count
      FROM subscription_usage
      WHERE user_id = p_user_id AND period_start = v_period_start;

      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'limit_exceeded',
        'message', format('Monthly enrichment limit reached (%s/%s). Upgrade your plan for more.', COALESCE(v_old_count, 0), v_max_limit),
        'current', COALESCE(v_old_count, 0),
        'limit', v_max_limit,
        'remaining', 0,
        'is_trial', false
      );
    END IF;

    RETURN jsonb_build_object(
      'allowed', true,
      'consumed', p_address_count,
      'current', v_new_count,
      'limit', v_max_limit,
      'remaining', GREATEST(0, v_max_limit - v_new_count),
      'is_trial', false
    );
  END IF;
END;
$function$;

-- =====================================================
-- 7. RPC: Get enrichment usage status for UI display
-- =====================================================
CREATE OR REPLACE FUNCTION public.fn_get_enrichment_usage(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sub record;
  v_is_trial boolean;
  v_max_limit integer;
  v_current_used integer;
BEGIN
  IF p_user_id != auth.uid() THEN
    RETURN jsonb_build_object('used', 0, 'limit', 0, 'remaining', 0, 'is_trial', false);
  END IF;

  SELECT * INTO v_sub
  FROM user_subscriptions
  WHERE user_id = p_user_id
    AND status IN ('active', 'trialing', 'past_due', 'trial')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_sub IS NULL THEN
    RETURN jsonb_build_object('used', 0, 'limit', 0, 'remaining', 0, 'is_trial', false, 'no_subscription', true);
  END IF;

  v_is_trial := v_sub.status IN ('trial', 'trialing');

  IF v_is_trial THEN
    v_current_used := COALESCE(v_sub.trial_enrichment_used, 0);
    v_max_limit := COALESCE(v_sub.trial_enrichment_limit, 500);

    RETURN jsonb_build_object(
      'used', v_current_used,
      'limit', v_max_limit,
      'remaining', GREATEST(0, v_max_limit - v_current_used),
      'is_trial', true
    );
  ELSE
    SELECT max_enrichment_addresses INTO v_max_limit
    FROM subscription_plans
    WHERE id = v_sub.plan_id;

    IF v_max_limit = -1 THEN
      RETURN jsonb_build_object('used', 0, 'limit', null, 'remaining', null, 'unlimited', true, 'is_trial', false);
    END IF;

    SELECT COALESCE(enrichment_addresses_count, 0) INTO v_current_used
    FROM subscription_usage
    WHERE user_id = p_user_id
      AND period_start = v_sub.current_period_start::date;

    v_current_used := COALESCE(v_current_used, 0);

    RETURN jsonb_build_object(
      'used', v_current_used,
      'limit', v_max_limit,
      'remaining', GREATEST(0, v_max_limit - v_current_used),
      'is_trial', false
    );
  END IF;
END;
$function$;

-- =====================================================
-- 8. Grant execute permissions to authenticated users
-- =====================================================
GRANT EXECUTE ON FUNCTION public.fn_check_enrichment_limit(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_consume_enrichment_usage(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_enrichment_usage(uuid) TO authenticated;
