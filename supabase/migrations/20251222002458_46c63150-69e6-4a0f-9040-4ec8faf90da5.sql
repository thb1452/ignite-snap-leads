-- Add skipped_count column to geocoding_jobs table
ALTER TABLE public.geocoding_jobs 
ADD COLUMN IF NOT EXISTS skipped_count integer NOT NULL DEFAULT 0;

-- Clean up stuck geocoding jobs (reset to queued so they can be picked up again)
UPDATE public.geocoding_jobs 
SET status = 'failed', 
    error_message = 'Job reset due to missing skipped_count column issue',
    finished_at = now()
WHERE status IN ('running', 'queued') 
  AND created_at < now() - interval '1 hour';