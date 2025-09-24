-- Create materials table
CREATE TABLE public.materials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT NOT NULL DEFAULT 'piece', -- "piece", "linear ft", "sq ft", "box"
  cost_per_unit DECIMAL(10,2) DEFAULT 0,
  current_stock INTEGER DEFAULT 0,
  warehouse_stock INTEGER DEFAULT 0,
  on_site_stock INTEGER DEFAULT 0,
  reorder_point INTEGER DEFAULT 10,
  supplier TEXT,
  category TEXT DEFAULT 'general', -- "lumber", "electrical", "plumbing", "hardware", "general"
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create job_materials table for assigning materials to jobs
CREATE TABLE public.job_materials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  job_id BIGINT NOT NULL, -- references violations table (jobs)
  material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  quantity_allocated INTEGER DEFAULT 0,
  quantity_used INTEGER DEFAULT 0,
  location TEXT DEFAULT 'warehouse', -- "warehouse", "job site", "in transit"
  date_assigned TIMESTAMP WITH TIME ZONE DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create meetings table
CREATE TABLE public.meetings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  title TEXT NOT NULL,
  type TEXT DEFAULT 'general', -- "site_inspection", "client_walkthrough", "permit_appointment", "vendor_meeting", "team_planning", "progress_review", "general"
  job_id BIGINT, -- optional reference to violations table (jobs)
  client_name TEXT,
  date_time TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  location TEXT,
  attendees TEXT[], -- array of attendee names/emails
  google_calendar_id TEXT,
  notes TEXT,
  status TEXT DEFAULT 'scheduled', -- "scheduled", "completed", "cancelled"
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

-- RLS policies for materials
CREATE POLICY "Users can view their org materials" 
ON public.materials 
FOR SELECT 
USING (org_id IN (SELECT profiles.org_id FROM profiles WHERE profiles.user_id = auth.uid()));

CREATE POLICY "Users can create materials for their org" 
ON public.materials 
FOR INSERT 
WITH CHECK (org_id IN (SELECT profiles.org_id FROM profiles WHERE profiles.user_id = auth.uid()));

CREATE POLICY "Users can update their org materials" 
ON public.materials 
FOR UPDATE 
USING (org_id IN (SELECT profiles.org_id FROM profiles WHERE profiles.user_id = auth.uid()));

-- RLS policies for job_materials
CREATE POLICY "Users can view their org job materials" 
ON public.job_materials 
FOR SELECT 
USING (org_id IN (SELECT profiles.org_id FROM profiles WHERE profiles.user_id = auth.uid()));

CREATE POLICY "Users can create job materials for their org" 
ON public.job_materials 
FOR INSERT 
WITH CHECK (org_id IN (SELECT profiles.org_id FROM profiles WHERE profiles.user_id = auth.uid()));

CREATE POLICY "Users can update their org job materials" 
ON public.job_materials 
FOR UPDATE 
USING (org_id IN (SELECT profiles.org_id FROM profiles WHERE profiles.user_id = auth.uid()));

-- RLS policies for meetings
CREATE POLICY "Users can view their org meetings" 
ON public.meetings 
FOR SELECT 
USING (org_id IN (SELECT profiles.org_id FROM profiles WHERE profiles.user_id = auth.uid()));

CREATE POLICY "Users can create meetings for their org" 
ON public.meetings 
FOR INSERT 
WITH CHECK (org_id IN (SELECT profiles.org_id FROM profiles WHERE profiles.user_id = auth.uid()));

CREATE POLICY "Users can update their org meetings" 
ON public.meetings 
FOR UPDATE 
USING (org_id IN (SELECT profiles.org_id FROM profiles WHERE profiles.user_id = auth.uid()));

-- Add triggers for updated_at
CREATE TRIGGER update_materials_updated_at
BEFORE UPDATE ON public.materials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_job_materials_updated_at
BEFORE UPDATE ON public.job_materials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_meetings_updated_at
BEFORE UPDATE ON public.meetings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add indexes for better performance
CREATE INDEX idx_materials_org_id ON public.materials(org_id);
CREATE INDEX idx_materials_category ON public.materials(category);
CREATE INDEX idx_job_materials_org_id ON public.job_materials(org_id);
CREATE INDEX idx_job_materials_job_id ON public.job_materials(job_id);
CREATE INDEX idx_job_materials_material_id ON public.job_materials(material_id);
CREATE INDEX idx_meetings_org_id ON public.meetings(org_id);
CREATE INDEX idx_meetings_date_time ON public.meetings(date_time);
CREATE INDEX idx_meetings_job_id ON public.meetings(job_id);