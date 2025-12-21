-- Add observability columns to upload_jobs
-- Tracks additional metrics for debugging and monitoring upload quality

ALTER TABLE public.upload_jobs
  ADD COLUMN IF NOT EXISTS rows_skipped INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insights_generated INT DEFAULT 0;

COMMENT ON COLUMN public.upload_jobs.rows_skipped IS 'Violations that could not be matched to properties (orphaned)';
COMMENT ON COLUMN public.upload_jobs.insights_generated IS 'Number of properties that received AI/rule-based insights';
COMMENT ON COLUMN public.upload_jobs.warnings IS 'JSON array of data quality warnings (e.g., orphaned violations, missing API keys)';
COMMENT ON COLUMN public.upload_jobs.total_rows IS 'Total rows in uploaded CSV (excluding header)';
COMMENT ON COLUMN public.upload_jobs.processed_rows IS 'Rows successfully parsed and staged';
COMMENT ON COLUMN public.upload_jobs.properties_created IS 'New properties created (not deduplicated)';
COMMENT ON COLUMN public.upload_jobs.violations_created IS 'Total violations created and linked to properties';
