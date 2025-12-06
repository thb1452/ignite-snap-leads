-- Add raw_description column to upload_staging for temporary storage during processing
ALTER TABLE public.upload_staging 
ADD COLUMN IF NOT EXISTS raw_description TEXT;

-- Add comment to document purpose
COMMENT ON COLUMN public.upload_staging.raw_description IS 'Temporary storage for raw city notes during CSV processing. Transferred to violations.raw_description.';