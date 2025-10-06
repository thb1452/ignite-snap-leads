-- Create SMS templates table
CREATE TABLE public.sms_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create email templates table
CREATE TABLE public.email_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create call logs table
CREATE TABLE public.call_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  duration INTEGER,
  notes TEXT,
  call_type TEXT NOT NULL CHECK (call_type IN ('outbound', 'inbound')),
  status TEXT NOT NULL CHECK (status IN ('completed', 'missed', 'voicemail', 'busy')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sms_templates
CREATE POLICY "Users can view their own SMS templates"
  ON public.sms_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own SMS templates"
  ON public.sms_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own SMS templates"
  ON public.sms_templates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own SMS templates"
  ON public.sms_templates FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for email_templates
CREATE POLICY "Users can view their own email templates"
  ON public.email_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own email templates"
  ON public.email_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own email templates"
  ON public.email_templates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own email templates"
  ON public.email_templates FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for call_logs
CREATE POLICY "Users can view their own call logs"
  ON public.call_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own call logs"
  ON public.call_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own call logs"
  ON public.call_logs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own call logs"
  ON public.call_logs FOR DELETE
  USING (auth.uid() = user_id);

-- Triggers for updated_at
CREATE TRIGGER update_sms_templates_updated_at
  BEFORE UPDATE ON public.sms_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert some default templates
INSERT INTO public.sms_templates (user_id, name, content, is_default) VALUES
  ('00000000-0000-0000-0000-000000000000', 'Initial Contact', 'Hi {name}, I noticed your property at {address}. I''d like to discuss a potential opportunity. Can we schedule a quick call?', true),
  ('00000000-0000-0000-0000-000000000000', 'Follow Up', 'Hi {name}, following up on my previous message about {address}. Are you available for a brief conversation?', true);

INSERT INTO public.email_templates (user_id, name, subject, content, is_default) VALUES
  ('00000000-0000-0000-0000-000000000000', 'Initial Outreach', 'Opportunity for {address}', 'Dear {name},\n\nI hope this email finds you well. I''m reaching out regarding your property at {address}.\n\nI believe there may be a valuable opportunity we should discuss. Would you be available for a brief call this week?\n\nBest regards', true),
  ('00000000-0000-0000-0000-000000000000', 'Property Assessment', 'Property Assessment - {address}', 'Dear {name},\n\nThank you for your time. I wanted to share some insights about {address} and discuss next steps.\n\nPlease let me know when would be a good time to connect.\n\nBest regards', true);