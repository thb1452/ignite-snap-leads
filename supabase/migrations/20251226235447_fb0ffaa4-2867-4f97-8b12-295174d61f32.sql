-- Add bad_addresses column to track invalid addresses in uploads
ALTER TABLE upload_jobs ADD COLUMN IF NOT EXISTS bad_addresses integer DEFAULT 0;
ALTER TABLE upload_jobs ADD COLUMN IF NOT EXISTS bad_address_samples jsonb DEFAULT '[]'::jsonb;