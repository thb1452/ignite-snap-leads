-- Create RLS policies for csv-uploads bucket using proper storage approach
-- Note: Storage bucket policies are managed differently in Supabase
-- Users can access their own folder in the csv-uploads bucket

-- First, ensure the bucket exists (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'csv-uploads', 
  'csv-uploads', 
  false,
  52428800, -- 50MB limit
  ARRAY['text/csv', 'application/vnd.ms-excel']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['text/csv', 'application/vnd.ms-excel']::text[];