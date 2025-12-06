-- Add raw_description column to violations table (INTERNAL ONLY - never shown to users)
ALTER TABLE public.violations 
ADD COLUMN IF NOT EXISTS raw_description TEXT;

-- Add comment to document that this is internal-only
COMMENT ON COLUMN public.violations.raw_description IS 'INTERNAL ONLY - Raw city inspection notes. NEVER display to end users.';