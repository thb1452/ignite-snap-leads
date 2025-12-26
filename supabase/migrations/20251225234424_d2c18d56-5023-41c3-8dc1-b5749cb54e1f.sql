-- Add scope column to upload_jobs table
ALTER TABLE public.upload_jobs 
ADD COLUMN scope text DEFAULT 'city' CHECK (scope IN ('city', 'county'));

-- Add scope column to properties table
ALTER TABLE public.properties 
ADD COLUMN scope text DEFAULT 'city' CHECK (scope IN ('city', 'county'));

-- Add county column to properties table for county-level records
ALTER TABLE public.properties 
ADD COLUMN county text;

-- Update existing records to have scope = 'city'
UPDATE public.upload_jobs SET scope = 'city' WHERE scope IS NULL;
UPDATE public.properties SET scope = 'city' WHERE scope IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.upload_jobs.scope IS 'Scope of the upload: city (city+state) or county (county+state only)';
COMMENT ON COLUMN public.properties.scope IS 'Scope of the property record: city (city+state) or county (county+state only)';