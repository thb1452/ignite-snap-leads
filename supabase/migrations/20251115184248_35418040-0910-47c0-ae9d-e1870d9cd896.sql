-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'va', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS policy: users can view their own roles
CREATE POLICY "Users can view own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- RLS policy: only admins can insert roles
CREATE POLICY "Admins can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS policy: only admins can update roles
CREATE POLICY "Admins can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- RLS policy: only admins can delete roles
CREATE POLICY "Admins can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Create counties table
CREATE TABLE public.counties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    county_name TEXT NOT NULL,
    state TEXT NOT NULL,
    foia_status TEXT,
    assigned_to UUID REFERENCES auth.users(id),
    upload_status TEXT DEFAULT 'pending',
    last_upload_date TIMESTAMP WITH TIME ZONE,
    list_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE (county_name, state)
);

ALTER TABLE public.counties ENABLE ROW LEVEL SECURITY;

-- Admins can do everything with counties
CREATE POLICY "Admins full access to counties"
ON public.counties
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- VAs can view their assigned counties
CREATE POLICY "VAs can view assigned counties"
ON public.counties
FOR SELECT
TO authenticated
USING (
    public.has_role(auth.uid(), 'va') 
    AND assigned_to = auth.uid()
);

-- Create staging_uploads table
CREATE TABLE public.staging_uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    county_id UUID REFERENCES public.counties(id),
    uploaded_by UUID REFERENCES auth.users(id),
    file_name TEXT NOT NULL,
    total_rows INTEGER,
    processed_rows INTEGER DEFAULT 0,
    failed_rows INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    error_messages JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    completed_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.staging_uploads ENABLE ROW LEVEL SECURITY;

-- Admins can view all staging uploads
CREATE POLICY "Admins view all staging"
ON public.staging_uploads
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- VAs can view their own uploads
CREATE POLICY "VAs view own uploads"
ON public.staging_uploads
FOR SELECT
TO authenticated
USING (
    public.has_role(auth.uid(), 'va') 
    AND uploaded_by = auth.uid()
);

-- VAs can insert their own uploads
CREATE POLICY "VAs insert own uploads"
ON public.staging_uploads
FOR INSERT
TO authenticated
WITH CHECK (
    public.has_role(auth.uid(), 'va') 
    AND uploaded_by = auth.uid()
);

-- Create upload_history table
CREATE TABLE public.upload_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    county_id UUID REFERENCES public.counties(id),
    uploaded_by UUID REFERENCES auth.users(id),
    file_name TEXT NOT NULL,
    row_count INTEGER,
    upload_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
    status TEXT NOT NULL,
    error_message TEXT
);

ALTER TABLE public.upload_history ENABLE ROW LEVEL SECURITY;

-- Admins can view all history
CREATE POLICY "Admins view all history"
ON public.upload_history
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- VAs can view their own history
CREATE POLICY "VAs view own history"
ON public.upload_history
FOR SELECT
TO authenticated
USING (
    public.has_role(auth.uid(), 'va') 
    AND uploaded_by = auth.uid()
);

-- Create clean_leads table for admin bulk uploads
CREATE TABLE public.clean_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID REFERENCES public.properties(id),
    county_id UUID REFERENCES public.counties(id),
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    zip TEXT,
    violation_description TEXT,
    violation_type TEXT,
    opened_date DATE,
    last_updated DATE,
    snap_score INTEGER,
    snap_insight TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.clean_leads ENABLE ROW LEVEL SECURITY;

-- Admins can do everything with clean_leads
CREATE POLICY "Admins full access to clean_leads"
ON public.clean_leads
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- All authenticated users can view clean_leads
CREATE POLICY "Users can view clean_leads"
ON public.clean_leads
FOR SELECT
TO authenticated
USING (true);