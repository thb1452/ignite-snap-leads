
-- Add properties_matched column to track existing properties that violations were linked to
ALTER TABLE public.upload_jobs
ADD COLUMN IF NOT EXISTS properties_matched integer DEFAULT 0;

-- Add comment explaining the column
COMMENT ON COLUMN public.upload_jobs.properties_matched IS 'Number of existing properties that violations were matched/linked to (not newly created)';
