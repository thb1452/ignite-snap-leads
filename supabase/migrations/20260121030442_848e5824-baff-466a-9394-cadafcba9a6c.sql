-- Add RLS to events table
ALTER TABLE IF EXISTS public.events ENABLE ROW LEVEL SECURITY;

-- Users can only see their own events
CREATE POLICY "events_select_own" ON public.events
FOR SELECT USING (user_id = auth.uid());

-- Users can insert their own events
CREATE POLICY "events_insert_own" ON public.events
FOR INSERT WITH CHECK (user_id = auth.uid());

-- Create webhook_events table if not exists (for Stripe idempotency)
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  processed_at timestamp with time zone DEFAULT now(),
  payload jsonb
);

-- Enable RLS on webhook_events - service role only
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- No user access - only service_role can access webhook_events
-- (Stripe webhooks use service role key)

-- Create subscription_usage table if not exists
CREATE TABLE IF NOT EXISTS public.subscription_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  usage_type text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  period_start timestamp with time zone NOT NULL,
  period_end timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, usage_type, period_start)
);

-- Enable RLS on subscription_usage
ALTER TABLE public.subscription_usage ENABLE ROW LEVEL SECURITY;

-- Users can view their own usage
CREATE POLICY "subscription_usage_select_own" ON public.subscription_usage
FOR SELECT USING (user_id = auth.uid());

-- Only backend can insert/update usage (via service role)
-- No INSERT/UPDATE policies for regular users