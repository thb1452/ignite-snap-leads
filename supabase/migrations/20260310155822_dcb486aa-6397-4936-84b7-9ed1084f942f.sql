
-- Create user_alerts table
CREATE TABLE public.user_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  alert_type text NOT NULL DEFAULT 'new_violation',
  title text NOT NULL,
  body text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_alerts ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can only read/update their own alerts
CREATE POLICY "Users can view own alerts"
  ON public.user_alerts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own alerts"
  ON public.user_alerts FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own alerts"
  ON public.user_alerts FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Service role inserts (from trigger)
CREATE POLICY "Service role can insert alerts"
  ON public.user_alerts FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_alerts;

-- Index for fast lookups
CREATE INDEX idx_user_alerts_user_id ON public.user_alerts(user_id, created_at DESC);
CREATE INDEX idx_user_alerts_unread ON public.user_alerts(user_id) WHERE is_read = false;

-- Trigger function: when a violation is inserted, create alerts for users who saved that property
CREATE OR REPLACE FUNCTION public.notify_saved_property_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_alerts (user_id, property_id, alert_type, title, body)
  SELECT
    sp.user_id,
    NEW.property_id,
    'new_violation',
    'New violation on tracked property',
    'A new ' || COALESCE(NEW.violation_type, 'code violation') || ' was filed at a property you are tracking.'
  FROM public.saved_properties sp
  LEFT JOIN public.email_preferences ep ON ep.user_id = sp.user_id
  WHERE sp.property_id = NEW.property_id
    AND COALESCE(ep.escalation_alerts_enabled, true) = true;

  RETURN NEW;
END;
$$;

-- Add escalation_alerts_enabled to email_preferences
ALTER TABLE public.email_preferences
  ADD COLUMN IF NOT EXISTS escalation_alerts_enabled boolean NOT NULL DEFAULT true;
