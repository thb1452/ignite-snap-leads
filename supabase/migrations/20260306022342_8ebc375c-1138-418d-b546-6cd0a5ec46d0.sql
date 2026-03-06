ALTER TABLE public.targets
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS submission_method text,
  ADD COLUMN IF NOT EXISTS notes text;