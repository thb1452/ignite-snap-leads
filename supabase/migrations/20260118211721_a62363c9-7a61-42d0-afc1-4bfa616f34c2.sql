
-- =============================================
-- SUBSCRIPTION SYSTEM TABLES
-- =============================================

-- 1. Subscription Plans table - stores available plans
CREATE TABLE public.subscription_plans (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL UNIQUE, -- 'starter', 'professional', 'enterprise'
    display_name text NOT NULL,
    description text,
    price_monthly_cents integer NOT NULL DEFAULT 0,
    price_annual_cents integer NOT NULL DEFAULT 0,
    
    -- Limits
    max_monthly_exports integer NOT NULL DEFAULT 0,
    max_counties integer NOT NULL DEFAULT 0, -- -1 for unlimited
    max_user_seats integer NOT NULL DEFAULT 1,
    max_skip_traces_per_month integer NOT NULL DEFAULT 0,
    
    -- Features (JSON for flexibility)
    features jsonb DEFAULT '[]'::jsonb,
    
    -- Feature flags
    has_advanced_filters boolean NOT NULL DEFAULT false,
    has_violation_filtering boolean NOT NULL DEFAULT false,
    has_rolling_intelligence boolean NOT NULL DEFAULT false,
    has_escalation_alerts boolean NOT NULL DEFAULT false,
    has_api_access boolean NOT NULL DEFAULT false,
    has_dedicated_manager boolean NOT NULL DEFAULT false,
    
    -- Metadata
    sort_order integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on subscription_plans (public read)
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active plans" 
    ON public.subscription_plans 
    FOR SELECT 
    USING (is_active = true);

-- 2. User Subscriptions table - tracks user subscriptions
CREATE TABLE public.user_subscriptions (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_id uuid NOT NULL REFERENCES public.subscription_plans(id),
    
    -- Stripe integration
    stripe_customer_id text,
    stripe_subscription_id text,
    
    -- Status
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'cancelled', 'unpaid', 'trialing')),
    
    -- Billing period
    current_period_start timestamp with time zone,
    current_period_end timestamp with time zone,
    
    -- Cancellation
    cancel_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    
    -- Metadata
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    
    -- Ensure one active subscription per user
    CONSTRAINT unique_active_subscription UNIQUE (user_id, status) 
);

-- Create index for fast lookups
CREATE INDEX idx_user_subscriptions_user_id ON public.user_subscriptions(user_id);
CREATE INDEX idx_user_subscriptions_status ON public.user_subscriptions(status);
CREATE INDEX idx_user_subscriptions_stripe_sub ON public.user_subscriptions(stripe_subscription_id);

-- Enable RLS
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own subscriptions" 
    ON public.user_subscriptions 
    FOR SELECT 
    USING (user_id = auth.uid());

-- 3. Usage Tracking table - tracks monthly usage per user
CREATE TABLE public.subscription_usage (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Period tracking
    period_start date NOT NULL,
    period_end date NOT NULL,
    
    -- Usage counts
    exports_count integer NOT NULL DEFAULT 0,
    skip_traces_count integer NOT NULL DEFAULT 0,
    api_calls_count integer NOT NULL DEFAULT 0,
    
    -- Timestamps
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    
    -- Unique per user per period
    CONSTRAINT unique_user_period UNIQUE (user_id, period_start)
);

CREATE INDEX idx_subscription_usage_user_period ON public.subscription_usage(user_id, period_start);

-- Enable RLS
ALTER TABLE public.subscription_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own usage" 
    ON public.subscription_usage 
    FOR SELECT 
    USING (user_id = auth.uid());

-- =============================================
-- SEED THE SUBSCRIPTION PLANS
-- =============================================

INSERT INTO public.subscription_plans (
    name, display_name, description, 
    price_monthly_cents, price_annual_cents,
    max_monthly_exports, max_counties, max_user_seats, max_skip_traces_per_month,
    has_advanced_filters, has_violation_filtering, has_rolling_intelligence, 
    has_escalation_alerts, has_api_access, has_dedicated_manager,
    features, sort_order
) VALUES 
(
    'starter', 
    'Starter', 
    'For focused local operators',
    11900, -- $119/month
    95200, -- $99/month * 12 = $1188/year (roughly 80% of monthly)
    2500,  -- max exports
    5,     -- max counties
    1,     -- max seats
    100,   -- skip traces
    false, -- advanced filters
    false, -- violation filtering
    false, -- rolling intelligence
    false, -- escalation alerts
    false, -- api access
    false, -- dedicated manager
    '["2,500 monthly exports", "5 county coverage (you choose)", "Basic SnapScore filtering", "Weekly data refresh", "1 user seat", "Email support"]'::jsonb,
    1
),
(
    'professional', 
    'Professional', 
    'For growing acquisition operations',
    24900, -- $249/month
    199200, -- $199/month * 12 = $2388/year
    10000,  -- max exports
    25,     -- max counties
    3,      -- max seats
    500,    -- skip traces
    true,   -- advanced filters
    true,   -- violation filtering
    true,   -- rolling intelligence
    false,  -- escalation alerts
    false,  -- api access
    false,  -- dedicated manager
    '["10,000 monthly exports", "25 county coverage", "Advanced SnapScore filters", "Violation type filtering", "Rolling 30-day intelligence", "3 user seats", "Priority email support"]'::jsonb,
    2
),
(
    'enterprise', 
    'Enterprise', 
    'For serious multi-market teams',
    49900, -- $499/month
    399200, -- $399/month * 12 = $4788/year
    25000,  -- max exports
    -1,     -- unlimited counties
    10,     -- max seats
    2000,   -- skip traces
    true,   -- advanced filters
    true,   -- violation filtering
    true,   -- rolling intelligence
    true,   -- escalation alerts
    true,   -- api access (coming soon)
    true,   -- dedicated manager
    '["25,000 monthly exports", "All 900+ counties", "Full SnapScore AI suite", "Escalation pattern alerts", "API access (coming soon)", "10 user seats", "Dedicated account manager"]'::jsonb,
    3
);

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

-- Function to get current user's active subscription with plan details
CREATE OR REPLACE FUNCTION public.fn_get_user_subscription(p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE (
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
    AND s.status IN ('active', 'trialing')
    ORDER BY s.created_at DESC
    LIMIT 1;
$$;

-- Function to get or create current period usage
CREATE OR REPLACE FUNCTION public.fn_get_current_usage(p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE (
    exports_count integer,
    skip_traces_count integer,
    api_calls_count integer,
    period_start date,
    period_end date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_period_start date;
    v_period_end date;
BEGIN
    -- Get current billing period (first of month to end of month)
    v_period_start := date_trunc('month', CURRENT_DATE)::date;
    v_period_end := (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date;
    
    -- Insert if not exists
    INSERT INTO public.subscription_usage (user_id, period_start, period_end)
    VALUES (p_user_id, v_period_start, v_period_end)
    ON CONFLICT (user_id, period_start) DO NOTHING;
    
    -- Return current usage
    RETURN QUERY
    SELECT 
        u.exports_count,
        u.skip_traces_count,
        u.api_calls_count,
        u.period_start,
        u.period_end
    FROM public.subscription_usage u
    WHERE u.user_id = p_user_id 
    AND u.period_start = v_period_start;
END;
$$;

-- Function to increment usage counter
CREATE OR REPLACE FUNCTION public.fn_increment_usage(
    p_usage_type text, -- 'exports', 'skip_traces', 'api_calls'
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
BEGIN
    v_period_start := date_trunc('month', CURRENT_DATE)::date;
    
    -- Ensure usage record exists
    PERFORM fn_get_current_usage(p_user_id);
    
    -- Update the appropriate counter
    IF p_usage_type = 'exports' THEN
        UPDATE public.subscription_usage 
        SET exports_count = exports_count + p_amount, updated_at = now()
        WHERE user_id = p_user_id AND period_start = v_period_start;
    ELSIF p_usage_type = 'skip_traces' THEN
        UPDATE public.subscription_usage 
        SET skip_traces_count = skip_traces_count + p_amount, updated_at = now()
        WHERE user_id = p_user_id AND period_start = v_period_start;
    ELSIF p_usage_type = 'api_calls' THEN
        UPDATE public.subscription_usage 
        SET api_calls_count = api_calls_count + p_amount, updated_at = now()
        WHERE user_id = p_user_id AND period_start = v_period_start;
    ELSE
        RETURN false;
    END IF;
    
    RETURN true;
END;
$$;

-- Function to check if user can perform an action (within limits)
CREATE OR REPLACE FUNCTION public.fn_check_subscription_limit(
    p_usage_type text, -- 'exports', 'skip_traces'
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
    v_usage record;
    v_limit integer;
    v_current integer;
    v_remaining integer;
BEGIN
    -- Get subscription
    SELECT * INTO v_subscription FROM fn_get_user_subscription(p_user_id);
    
    -- If no subscription, user has no access (or we could give free tier limits)
    IF v_subscription IS NULL THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'no_subscription',
            'message', 'No active subscription found. Please subscribe to continue.'
        );
    END IF;
    
    -- Get current usage
    SELECT * INTO v_usage FROM fn_get_current_usage(p_user_id);
    
    -- Determine limit and current usage based on type
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
    
    v_remaining := v_limit - v_current;
    
    -- Check if action is allowed
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
$$;

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_subscription_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_subscription_plans_timestamp
    BEFORE UPDATE ON public.subscription_plans
    FOR EACH ROW
    EXECUTE FUNCTION public.update_subscription_timestamp();

CREATE TRIGGER update_user_subscriptions_timestamp
    BEFORE UPDATE ON public.user_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_subscription_timestamp();

CREATE TRIGGER update_subscription_usage_timestamp
    BEFORE UPDATE ON public.subscription_usage
    FOR EACH ROW
    EXECUTE FUNCTION public.update_subscription_timestamp();
