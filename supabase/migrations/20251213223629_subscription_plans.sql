-- ================================================
-- SUBSCRIPTION PLANS & USAGE TRACKING
-- ================================================
-- This migration implements the Phase 1 SaaS business model
-- as described in the Snap Core Problem vision document.
--
-- Tiers:
-- - Starter: $39/mo
-- - Pro: $89/mo
-- - Elite: $199/mo
--
-- Limits enforced:
-- - Number of cities/jurisdictions
-- - Monthly records access
-- - CSV exports per month
-- - SnapScore range access
-- - Skip trace credits
-- ================================================

-- Create subscription_plans table
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  price_monthly_cents INTEGER NOT NULL,
  stripe_price_id TEXT,

  -- Limits
  max_jurisdictions INTEGER NOT NULL DEFAULT 1,
  max_monthly_records INTEGER NOT NULL DEFAULT 1000,
  max_csv_exports_per_month INTEGER NOT NULL DEFAULT 5,
  min_snap_score INTEGER DEFAULT 0, -- Access to properties with score >= this value
  max_snap_score INTEGER DEFAULT 100,
  skip_trace_credits_per_month INTEGER NOT NULL DEFAULT 0,
  can_access_api BOOLEAN DEFAULT false,
  can_bulk_sms BOOLEAN DEFAULT false,
  can_bulk_mail BOOLEAN DEFAULT false,

  -- Display
  description TEXT,
  features JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user_subscriptions table
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.subscription_plans(id),

  -- Subscription status
  status TEXT NOT NULL DEFAULT 'active', -- active, cancelled, expired, trial
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,

  -- Billing cycle
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  cancel_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Ensure one active subscription per user
  UNIQUE(user_id, status) WHERE status = 'active'
);

-- Create usage_tracking table
CREATE TABLE IF NOT EXISTS public.usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.user_subscriptions(id) ON DELETE SET NULL,

  -- Usage period
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,

  -- Usage counters
  csv_exports_count INTEGER DEFAULT 0,
  records_accessed_count INTEGER DEFAULT 0,
  skip_traces_used INTEGER DEFAULT 0,
  api_calls_count INTEGER DEFAULT 0,
  bulk_sms_sent INTEGER DEFAULT 0,
  bulk_mail_sent INTEGER DEFAULT 0,

  -- Jurisdictions accessed (stored as array of IDs)
  jurisdictions_accessed UUID[] DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One usage record per user per billing period
  UNIQUE(user_id, period_start, period_end)
);

-- Create usage_events table (detailed event log)
CREATE TABLE IF NOT EXISTS public.usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.user_subscriptions(id) ON DELETE SET NULL,

  -- Event details
  event_type TEXT NOT NULL, -- csv_export, skip_trace, api_call, bulk_sms, bulk_mail
  resource_type TEXT, -- property, violation, list
  resource_id UUID,
  quantity INTEGER DEFAULT 1,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for subscription_plans
CREATE POLICY "Anyone can view active subscription plans"
ON public.subscription_plans
FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can manage subscription plans"
ON public.subscription_plans
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for user_subscriptions
CREATE POLICY "Users can view their own subscriptions"
ON public.user_subscriptions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can view all subscriptions"
ON public.user_subscriptions
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage subscriptions"
ON public.user_subscriptions
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for usage_tracking
CREATE POLICY "Users can view their own usage"
ON public.usage_tracking
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "System can insert usage records"
ON public.usage_tracking
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "System can update usage records"
ON public.usage_tracking
FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can view all usage"
ON public.usage_tracking
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for usage_events
CREATE POLICY "Users can view their own events"
ON public.usage_events
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "System can insert usage events"
ON public.usage_events
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all events"
ON public.usage_events
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON public.user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON public.user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plan_id ON public.user_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_user_id ON public.usage_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_period ON public.usage_tracking(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_usage_events_user_id ON public.usage_events(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_created_at ON public.usage_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_event_type ON public.usage_events(event_type);

-- Insert default subscription plans (Phase 1 SaaS tiers)
INSERT INTO public.subscription_plans (
  name,
  display_name,
  price_monthly_cents,
  max_jurisdictions,
  max_monthly_records,
  max_csv_exports_per_month,
  min_snap_score,
  max_snap_score,
  skip_trace_credits_per_month,
  can_access_api,
  can_bulk_sms,
  can_bulk_mail,
  description,
  features,
  sort_order
) VALUES
(
  'starter',
  'Starter',
  3900, -- $39/mo
  3, -- 3 jurisdictions
  5000, -- 5,000 records/month
  10, -- 10 CSV exports/month
  0, -- No score restrictions
  100,
  50, -- 50 skip trace credits/month
  false,
  false,
  false,
  'Perfect for individual investors testing the platform',
  '[
    "Up to 3 jurisdictions",
    "5,000 records per month",
    "10 CSV exports/month",
    "50 skip trace credits/month",
    "Full SnapScore access",
    "Map heat layers",
    "Email support"
  ]'::jsonb,
  1
),
(
  'pro',
  'Pro',
  8900, -- $89/mo
  10, -- 10 jurisdictions
  25000, -- 25,000 records/month
  50, -- 50 CSV exports/month
  0, -- No score restrictions
  100,
  250, -- 250 skip trace credits/month
  false,
  true, -- Bulk SMS enabled
  false,
  'For active investors scaling their operations',
  '[
    "Up to 10 jurisdictions",
    "25,000 records per month",
    "50 CSV exports/month",
    "250 skip trace credits/month",
    "Bulk SMS campaigns",
    "Priority support",
    "Advanced filtering",
    "List management"
  ]'::jsonb,
  2
),
(
  'elite',
  'Elite',
  19900, -- $199/mo
  -1, -- Unlimited jurisdictions (-1 = unlimited)
  100000, -- 100,000 records/month
  -1, -- Unlimited exports
  0, -- No score restrictions
  100,
  1000, -- 1,000 skip trace credits/month
  true, -- API access
  true, -- Bulk SMS enabled
  true, -- Bulk mail enabled
  'For power users and teams managing multiple markets',
  '[
    "Unlimited jurisdictions",
    "100,000 records per month",
    "Unlimited CSV exports",
    "1,000 skip trace credits/month",
    "API access",
    "Bulk SMS & Mail campaigns",
    "Dedicated account manager",
    "Custom integrations",
    "White-label reporting"
  ]'::jsonb,
  3
),
(
  'free_trial',
  'Free Trial',
  0, -- Free
  1, -- 1 jurisdiction
  100, -- 100 records during trial
  3, -- 3 exports
  40, -- Only properties with score >= 40 (value-add and distressed)
  100,
  5, -- 5 skip trace credits
  false,
  false,
  false,
  '14-day free trial to experience Snap',
  '[
    "14-day free trial",
    "1 jurisdiction",
    "100 records",
    "3 CSV exports",
    "5 skip trace credits",
    "Access to properties with SnapScore ≥ 40"
  ]'::jsonb,
  0
)
ON CONFLICT (name) DO NOTHING;

-- Function to get current user's active subscription
CREATE OR REPLACE FUNCTION public.get_user_subscription()
RETURNS TABLE (
  subscription_id UUID,
  plan_id UUID,
  plan_name TEXT,
  status TEXT,
  period_end TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    us.id AS subscription_id,
    us.plan_id,
    sp.name AS plan_name,
    us.status,
    us.current_period_end AS period_end
  FROM public.user_subscriptions us
  JOIN public.subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = auth.uid()
    AND us.status = 'active'
  LIMIT 1;
$$;

-- Function to check if user can perform action based on limits
CREATE OR REPLACE FUNCTION public.check_usage_limit(
  _event_type TEXT,
  _quantity INTEGER DEFAULT 1
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID;
  _subscription RECORD;
  _plan RECORD;
  _usage RECORD;
  _current_period_start TIMESTAMPTZ;
  _current_period_end TIMESTAMPTZ;
BEGIN
  _user_id := auth.uid();

  -- Get active subscription
  SELECT * INTO _subscription
  FROM public.user_subscriptions
  WHERE user_id = _user_id AND status = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false; -- No active subscription
  END IF;

  -- Get plan limits
  SELECT * INTO _plan
  FROM public.subscription_plans
  WHERE id = _subscription.plan_id;

  -- Calculate current billing period
  _current_period_start := _subscription.current_period_start;
  _current_period_end := _subscription.current_period_end;

  -- Get current usage
  SELECT * INTO _usage
  FROM public.usage_tracking
  WHERE user_id = _user_id
    AND period_start = _current_period_start
    AND period_end = _current_period_end;

  -- Check limits based on event type
  CASE _event_type
    WHEN 'csv_export' THEN
      IF _plan.max_csv_exports_per_month = -1 THEN
        RETURN true; -- Unlimited
      END IF;
      RETURN COALESCE(_usage.csv_exports_count, 0) + _quantity <= _plan.max_csv_exports_per_month;

    WHEN 'skip_trace' THEN
      RETURN COALESCE(_usage.skip_traces_used, 0) + _quantity <= _plan.skip_trace_credits_per_month;

    WHEN 'bulk_sms' THEN
      IF NOT _plan.can_bulk_sms THEN
        RETURN false;
      END IF;
      RETURN true;

    WHEN 'bulk_mail' THEN
      IF NOT _plan.can_bulk_mail THEN
        RETURN false;
      END IF;
      RETURN true;

    WHEN 'api_call' THEN
      RETURN _plan.can_access_api;

    ELSE
      RETURN false;
  END CASE;
END;
$$;

-- Function to record usage event
CREATE OR REPLACE FUNCTION public.record_usage_event(
  _event_type TEXT,
  _resource_type TEXT DEFAULT NULL,
  _resource_id UUID DEFAULT NULL,
  _quantity INTEGER DEFAULT 1,
  _metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID;
  _subscription_id UUID;
  _event_id UUID;
  _period_start TIMESTAMPTZ;
  _period_end TIMESTAMPTZ;
BEGIN
  _user_id := auth.uid();

  -- Get active subscription
  SELECT id, current_period_start, current_period_end
  INTO _subscription_id, _period_start, _period_end
  FROM public.user_subscriptions
  WHERE user_id = _user_id AND status = 'active'
  LIMIT 1;

  -- Insert usage event
  INSERT INTO public.usage_events (
    user_id,
    subscription_id,
    event_type,
    resource_type,
    resource_id,
    quantity,
    metadata
  ) VALUES (
    _user_id,
    _subscription_id,
    _event_type,
    _resource_type,
    _resource_id,
    _quantity,
    _metadata
  )
  RETURNING id INTO _event_id;

  -- Update usage_tracking aggregate
  IF _subscription_id IS NOT NULL THEN
    INSERT INTO public.usage_tracking (
      user_id,
      subscription_id,
      period_start,
      period_end
    ) VALUES (
      _user_id,
      _subscription_id,
      _period_start,
      _period_end
    )
    ON CONFLICT (user_id, period_start, period_end) DO NOTHING;

    -- Increment counters based on event type
    UPDATE public.usage_tracking
    SET
      csv_exports_count = CASE WHEN _event_type = 'csv_export' THEN csv_exports_count + _quantity ELSE csv_exports_count END,
      skip_traces_used = CASE WHEN _event_type = 'skip_trace' THEN skip_traces_used + _quantity ELSE skip_traces_used END,
      api_calls_count = CASE WHEN _event_type = 'api_call' THEN api_calls_count + _quantity ELSE api_calls_count END,
      bulk_sms_sent = CASE WHEN _event_type = 'bulk_sms' THEN bulk_sms_sent + _quantity ELSE bulk_sms_sent END,
      bulk_mail_sent = CASE WHEN _event_type = 'bulk_mail' THEN bulk_mail_sent + _quantity ELSE bulk_mail_sent END,
      updated_at = now()
    WHERE user_id = _user_id
      AND period_start = _period_start
      AND period_end = _period_end;
  END IF;

  RETURN _event_id;
END;
$$;

-- Add updated_at trigger for subscription_plans
CREATE TRIGGER update_subscription_plans_updated_at
BEFORE UPDATE ON public.subscription_plans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add updated_at trigger for user_subscriptions
CREATE TRIGGER update_user_subscriptions_updated_at
BEFORE UPDATE ON public.user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add updated_at trigger for usage_tracking
CREATE TRIGGER update_usage_tracking_updated_at
BEFORE UPDATE ON public.usage_tracking
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add helpful comments
COMMENT ON TABLE public.subscription_plans IS 'Subscription tier definitions with usage limits (Phase 1 SaaS model)';
COMMENT ON TABLE public.user_subscriptions IS 'User subscription tracking with billing cycle information';
COMMENT ON TABLE public.usage_tracking IS 'Aggregated usage counters per billing period';
COMMENT ON TABLE public.usage_events IS 'Detailed event log for all billable actions';
COMMENT ON FUNCTION public.check_usage_limit IS 'Checks if user can perform action within their plan limits';
COMMENT ON FUNCTION public.record_usage_event IS 'Records a billable event and updates usage counters';
