
ALTER TABLE public.targets ADD COLUMN IF NOT EXISTS contact_value text;
ALTER TABLE public.targets ADD COLUMN IF NOT EXISTS credential_to_use text;
ALTER TABLE public.targets ADD COLUMN IF NOT EXISTS submission_method text;

ALTER TABLE public.foia_requests ADD COLUMN IF NOT EXISTS email_used text;
ALTER TABLE public.foia_requests ADD COLUMN IF NOT EXISTS response_type text;
ALTER TABLE public.foia_requests ADD COLUMN IF NOT EXISTS upload_job_id uuid;
