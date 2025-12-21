-- Add skipped_count column to geocoding_jobs
-- Tracks properties skipped because they have no real address (e.g. "Parcel-Based Location")
-- These are NOT failures - they're ungeocodable by design

ALTER TABLE public.geocoding_jobs
  ADD COLUMN IF NOT EXISTS skipped_count INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.geocoding_jobs.skipped_count IS 'Properties skipped (no real address, e.g. Parcel-Based Location)';
