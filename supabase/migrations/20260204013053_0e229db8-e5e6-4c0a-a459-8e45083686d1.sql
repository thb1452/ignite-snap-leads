-- Add source_type column to upload_jobs to track water disconnection uploads
ALTER TABLE public.upload_jobs 
ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'code_violation';

-- Add comment for documentation
COMMENT ON COLUMN public.upload_jobs.source_type IS 'Type of data in this upload: code_violation (default) or water_disconnection';