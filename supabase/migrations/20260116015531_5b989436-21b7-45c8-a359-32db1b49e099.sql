-- Email preferences table to track user digest settings
CREATE TABLE IF NOT EXISTS public.email_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  weekly_digest_enabled BOOLEAN NOT NULL DEFAULT true,
  digest_day INTEGER NOT NULL DEFAULT 1, -- 1 = Monday
  digest_hour INTEGER NOT NULL DEFAULT 8, -- 8am
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own email preferences" 
  ON public.email_preferences FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own email preferences" 
  ON public.email_preferences FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own email preferences" 
  ON public.email_preferences FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Email analytics table
CREATE TABLE IF NOT EXISTS public.email_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  email_type TEXT NOT NULL, -- 'weekly_digest', 'welcome', etc.
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  opened_at TIMESTAMP WITH TIME ZONE,
  clicked_at TIMESTAMP WITH TIME ZONE,
  email_subject TEXT,
  properties_featured INTEGER DEFAULT 0,
  new_violations_count INTEGER DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.email_analytics ENABLE ROW LEVEL SECURITY;

-- Only admins can view analytics (no user access needed)
CREATE POLICY "Admins can view email analytics" 
  ON public.email_analytics FOR SELECT 
  USING (public.has_role(auth.uid(), 'admin'));

-- Service role can insert (for edge functions)
CREATE POLICY "Service role can insert email analytics" 
  ON public.email_analytics FOR INSERT 
  WITH CHECK (true);

-- Trigger for updating timestamps
CREATE TRIGGER update_email_preferences_updated_at
  BEFORE UPDATE ON public.email_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for faster lookups
CREATE INDEX idx_email_analytics_user_sent ON public.email_analytics(user_id, sent_at DESC);
CREATE INDEX idx_email_preferences_digest ON public.email_preferences(weekly_digest_enabled, digest_day, digest_hour);