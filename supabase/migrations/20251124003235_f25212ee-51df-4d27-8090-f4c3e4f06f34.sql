-- Add city, county, state columns to upload_jobs table
ALTER TABLE public.upload_jobs
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS county text,
  ADD COLUMN IF NOT EXISTS state text;

-- Make jurisdiction_id nullable since we're moving to manual entry
ALTER TABLE public.upload_jobs
  ALTER COLUMN jurisdiction_id DROP NOT NULL;