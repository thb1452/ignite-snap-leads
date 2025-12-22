-- Drop the old constraint and add a new one with all valid statuses
ALTER TABLE upload_jobs DROP CONSTRAINT IF EXISTS upload_jobs_status_check;

ALTER TABLE upload_jobs ADD CONSTRAINT upload_jobs_status_check 
CHECK (status IN ('QUEUED', 'PARSING', 'PROCESSING', 'DEDUPING', 'CREATING_VIOLATIONS', 'FINALIZING', 'COMPLETE', 'FAILED'));