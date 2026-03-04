ALTER TABLE public.foia_requests
  ADD COLUMN IF NOT EXISTS fee_amount numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS redaction_flag boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS estimated_row_count integer DEFAULT NULL;