
-- 1. Create enrichment_jobs table
CREATE TABLE public.enrichment_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  file_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  total_rows integer NOT NULL DEFAULT 0,
  processed_rows integer NOT NULL DEFAULT 0,
  matched_rows integer NOT NULL DEFAULT 0,
  addresses_charged integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.enrichment_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own enrichment jobs"
  ON public.enrichment_jobs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own enrichment jobs"
  ON public.enrichment_jobs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 2. fn_check_enrichment_limit
CREATE OR REPLACE FUNCTION public.fn_check_enrichment_limit(
  p_user_id uuid,
  p_address_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub record;
  v_is_trial boolean := false;
  v_limit integer := 500;
  v_used integer := 0;
  v_remaining integer;
  v_period_start timestamptz;
BEGIN
  SELECT us.*, sp.name as plan_name
  INTO v_sub
  FROM user_subscriptions us
  LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = p_user_id
    AND us.status IN ('active', 'trialing')
  ORDER BY us.created_at DESC
  LIMIT 1;

  IF v_sub IS NULL THEN
    v_limit := 500;
    v_is_trial := true;
    v_period_start := date_trunc('month', now());
  ELSIF v_sub.status = 'trialing' THEN
    v_is_trial := true;
    v_limit := COALESCE(v_sub.trial_exports_limit, 500);
    v_period_start := COALESCE(v_sub.current_period_start, v_sub.trial_started_at, date_trunc('month', now()));
  ELSE
    v_is_trial := false;
    v_limit := CASE 
      WHEN v_sub.plan_name ILIKE '%elite%' OR v_sub.plan_name ILIKE '%enterprise%' THEN 50000
      WHEN v_sub.plan_name ILIKE '%pro%' THEN 25000
      WHEN v_sub.plan_name ILIKE '%starter%' THEN 10000
      ELSE 10000
    END;
    v_period_start := COALESCE(v_sub.current_period_start, date_trunc('month', now()));
  END IF;

  SELECT COALESCE(SUM(addresses_charged), 0)
  INTO v_used
  FROM enrichment_jobs
  WHERE user_id = p_user_id
    AND created_at >= v_period_start;

  v_remaining := GREATEST(v_limit - v_used, 0);

  IF v_used + p_address_count > v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', CASE WHEN v_is_trial THEN 'trial_limit_exceeded' ELSE 'plan_limit_exceeded' END,
      'message', format('You have used %s of %s scan addresses this period. This upload requires %s.', v_used, v_limit, p_address_count),
      'current', v_used,
      'limit', v_limit,
      'remaining', v_remaining,
      'is_trial', v_is_trial
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'current', v_used,
    'limit', v_limit,
    'remaining', v_remaining,
    'is_trial', v_is_trial
  );
END;
$$;

-- 3. fn_consume_enrichment_usage
CREATE OR REPLACE FUNCTION public.fn_consume_enrichment_usage(
  p_user_id uuid,
  p_address_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check jsonb;
BEGIN
  v_check := fn_check_enrichment_limit(p_user_id, p_address_count);
  
  IF NOT (v_check->>'allowed')::boolean THEN
    RETURN v_check;
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'remaining', (v_check->>'remaining')::integer - p_address_count,
    'charged', p_address_count
  );
END;
$$;
