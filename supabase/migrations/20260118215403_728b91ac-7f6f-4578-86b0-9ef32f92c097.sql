-- =========================================================
-- Part 3: Webhook Events Table for Idempotency
-- =========================================================

CREATE TABLE IF NOT EXISTS public.webhook_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id text UNIQUE NOT NULL,
    event_type text NOT NULL,
    processed_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb
);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Only service role can access
CREATE POLICY "Service role only" ON public.webhook_events
FOR ALL USING (false) WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON public.webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed_at ON public.webhook_events(processed_at);

GRANT INSERT, SELECT ON public.webhook_events TO service_role;