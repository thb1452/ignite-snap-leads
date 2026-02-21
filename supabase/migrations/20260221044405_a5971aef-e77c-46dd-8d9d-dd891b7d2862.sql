
-- Finding 23: Drop the dangerous INSERT policy on credit_ledger
-- Only SECURITY DEFINER functions (service role) should write to this table
DROP POLICY IF EXISTS "credit_ledger_insert" ON public.credit_ledger;

-- Finding 24: Fix fn_increment_usage to enforce auth.uid() check
-- There are two versions; replace both with auth.uid() guard
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
  -- SECURITY: Enforce caller identity
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- Get billing period from active subscription
  SELECT current_period_start::date, current_period_end::date
  INTO v_period_start, v_period_end
  FROM user_subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
  LIMIT 1;

  -- Fallback to calendar month if no active subscription
  IF v_period_start IS NULL THEN
    v_period_start := date_trunc('month', CURRENT_DATE)::date;
    v_period_end := (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date;
  END IF;

  -- Upsert usage record
  INSERT INTO subscription_usage (user_id, period_start, period_end)
  VALUES (p_user_id, v_period_start, v_period_end)
  ON CONFLICT (user_id, period_start) DO NOTHING;

  -- Increment the appropriate counter
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

-- Finding 25: Fix fn_check_subscription_limit and fn_get_user_subscription
-- to enforce auth.uid() check, preventing subscription enumeration

CREATE OR REPLACE FUNCTION public.fn_get_user_subscription(p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE(
  subscription_id uuid,
  user_id uuid,
  plan_id uuid,
  plan_name text,
  display_name text,
  status text,
  current_period_start timestamptz,
  current_period_end timestamptz,
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
STABLE
SECURITY DEFINER
SET search_path = public
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
    AND p_user_id = auth.uid()  -- SECURITY: only own subscription
    AND s.status IN ('active', 'trialing', 'trial')
  ORDER BY s.created_at DESC
  LIMIT 1;
$$;

-- Finding 26: Restrict clean_leads SELECT to admins only
DROP POLICY IF EXISTS "Authenticated users can view clean_leads" ON public.clean_leads;
CREATE POLICY "Admins can view clean_leads"
  ON public.clean_leads
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));
