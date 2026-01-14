-- Add missing columns to counties table
ALTER TABLE public.counties 
ADD COLUMN IF NOT EXISTS foia_portal_url TEXT,
ADD COLUMN IF NOT EXISTS portal_type TEXT DEFAULT 'web_form',
ADD COLUMN IF NOT EXISTS last_request_date DATE,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Create foia_requests table
CREATE TABLE IF NOT EXISTS public.foia_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  county_id UUID REFERENCES public.counties(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL,
  request_date DATE NOT NULL DEFAULT CURRENT_DATE,
  request_method TEXT DEFAULT 'email',
  data_years_requested TEXT,
  status TEXT DEFAULT 'pending',
  response_date DATE,
  invoice_amount DECIMAL(10,2),
  invoice_paid BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create foia_templates table
CREATE TABLE IF NOT EXISTS public.foia_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  state TEXT,
  template_text TEXT NOT NULL,
  use_count INTEGER DEFAULT 0,
  success_rate DECIMAL(5,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.foia_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foia_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies for foia_requests (VAs can see their own, admins see all)
CREATE POLICY "VAs can view their own requests" ON public.foia_requests
  FOR SELECT USING (
    requested_by = auth.uid() OR 
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "VAs can insert their own requests" ON public.foia_requests
  FOR INSERT WITH CHECK (requested_by = auth.uid());

CREATE POLICY "VAs can update their own requests" ON public.foia_requests
  FOR UPDATE USING (
    requested_by = auth.uid() OR 
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- RLS policies for foia_templates (everyone can read, admins can modify)
CREATE POLICY "Everyone can view templates" ON public.foia_templates
  FOR SELECT USING (true);

CREATE POLICY "Admins can insert templates" ON public.foia_templates
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update templates" ON public.foia_templates
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Update counties RLS for VA access
DROP POLICY IF EXISTS "Users can view counties" ON public.counties;
DROP POLICY IF EXISTS "VAs can view assigned counties" ON public.counties;
DROP POLICY IF EXISTS "Admins can manage all counties" ON public.counties;

CREATE POLICY "VAs can view assigned counties" ON public.counties
  FOR SELECT USING (
    assigned_to = auth.uid() OR
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can manage all counties" ON public.counties
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "VAs can update assigned counties" ON public.counties
  FOR UPDATE USING (assigned_to = auth.uid());

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_foia_requests_county ON public.foia_requests(county_id);
CREATE INDEX IF NOT EXISTS idx_foia_requests_requested_by ON public.foia_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_foia_requests_date ON public.foia_requests(request_date);
CREATE INDEX IF NOT EXISTS idx_counties_assigned ON public.counties(assigned_to);
CREATE INDEX IF NOT EXISTS idx_counties_state ON public.counties(state);
CREATE INDEX IF NOT EXISTS idx_counties_status ON public.counties(foia_status);

-- Insert initial templates
INSERT INTO public.foia_templates (name, state, template_text) VALUES
('Standard Request (2020-2024)', NULL, 'Under the [STATE] Public Records Act, I respectfully request electronic copies of all code violation and enforcement records from January 1, 2020 through December 31, 2024, including: violation type, property address, date cited, citation status, resolution date, and any related case notes or documents. Please provide the records in electronic format (CSV or Excel preferred). Thank you for your assistance.'),
('Extended Request (2017-2024)', NULL, 'Under the [STATE] Public Records Act, I respectfully request electronic copies of all code violation and enforcement records from January 1, 2017 through December 31, 2024, including: violation type, property address, date cited, citation status, resolution date, and any related case notes or documents. Please provide the records in electronic format (CSV or Excel preferred). Thank you for your assistance.'),
('Ohio Public Records Act Request', 'OH', 'Pursuant to Ohio Revised Code Section 149.43, I am requesting access to and copies of all code violation and enforcement records for [COUNTY NAME] from January 1, 2020 through December 31, 2024. Specifically, I request: 1) All code violation citations including violation type, property address, and citation date; 2) Resolution status and dates for all violations; 3) Any related case notes or enforcement documents. Please provide these records in electronic format. Under ORC 149.43, I request a response within a reasonable time period. Thank you.')
ON CONFLICT DO NOTHING;