-- Create organizations table
CREATE TABLE public.organizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  credits INTEGER DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create profiles table for user information
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create uploads table for tracking CSV uploads
CREATE TABLE public.uploads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create staging_violations table for raw CSV data
CREATE TABLE public.staging_violations (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  upload_id UUID NOT NULL REFERENCES public.uploads(id) ON DELETE CASCADE,
  raw JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create violations table for processed data
CREATE TABLE public.violations (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  case_id TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  violation TEXT,
  status TEXT,
  opened_date DATE,
  last_updated DATE,
  snap_score INTEGER DEFAULT 0,
  insight TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create contacts table for skip trace results
CREATE TABLE public.contacts (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id BIGINT NOT NULL REFERENCES public.violations(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'phone' or 'email'
  value TEXT NOT NULL,
  line_type TEXT,
  is_dnc BOOLEAN DEFAULT false,
  confidence NUMERIC DEFAULT 0,
  source TEXT DEFAULT 'skip_trace',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create audit_events table for tracking actions
CREATE TABLE public.audit_events (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security on all tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staging_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for organizations
CREATE POLICY "Users can view their organization" 
ON public.organizations 
FOR SELECT 
USING (id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update their organization" 
ON public.organizations 
FOR UPDATE 
USING (id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

-- Create RLS policies for profiles
CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own profile" 
ON public.profiles 
FOR INSERT 
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
USING (user_id = auth.uid());

-- Create RLS policies for uploads
CREATE POLICY "Users can view their org uploads" 
ON public.uploads 
FOR SELECT 
USING (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can create uploads for their org" 
ON public.uploads 
FOR INSERT 
WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update their org uploads" 
ON public.uploads 
FOR UPDATE 
USING (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

-- Create RLS policies for staging_violations
CREATE POLICY "Users can view their org staging violations" 
ON public.staging_violations 
FOR SELECT 
USING (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can create staging violations for their org" 
ON public.staging_violations 
FOR INSERT 
WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

-- Create RLS policies for violations
CREATE POLICY "Users can view their org violations" 
ON public.violations 
FOR SELECT 
USING (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can create violations for their org" 
ON public.violations 
FOR INSERT 
WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update their org violations" 
ON public.violations 
FOR UPDATE 
USING (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

-- Create RLS policies for contacts
CREATE POLICY "Users can view their org contacts" 
ON public.contacts 
FOR SELECT 
USING (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can create contacts for their org" 
ON public.contacts 
FOR INSERT 
WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

-- Create RLS policies for audit_events
CREATE POLICY "Users can view their org audit events" 
ON public.audit_events 
FOR SELECT 
USING (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can create audit events for their org" 
ON public.audit_events 
FOR INSERT 
WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_organizations_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_violations_updated_at
BEFORE UPDATE ON public.violations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX idx_profiles_org_id ON public.profiles(org_id);
CREATE INDEX idx_uploads_org_id ON public.uploads(org_id);
CREATE INDEX idx_staging_violations_org_id ON public.staging_violations(org_id);
CREATE INDEX idx_staging_violations_upload_id ON public.staging_violations(upload_id);
CREATE INDEX idx_violations_org_id ON public.violations(org_id);
CREATE INDEX idx_violations_snap_score ON public.violations(snap_score);
CREATE INDEX idx_violations_city ON public.violations(city);
CREATE INDEX idx_violations_status ON public.violations(status);
CREATE INDEX idx_contacts_org_id ON public.contacts(org_id);
CREATE INDEX idx_contacts_lead_id ON public.contacts(lead_id);
CREATE INDEX idx_audit_events_org_id ON public.audit_events(org_id);

-- Insert demo organization
INSERT INTO public.organizations (id, name, credits) 
VALUES ('00000000-0000-0000-0000-000000000001', 'Demo Organization', 100);