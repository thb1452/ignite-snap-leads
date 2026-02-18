-- ============================================================
-- Fix storage RLS policies for csv-uploads bucket
-- and add missing upload_jobs RLS policies
-- ============================================================

-- 1. Ensure csv-uploads bucket exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'csv-uploads',
  'csv-uploads',
  false,
  52428800, -- 50MB
  ARRAY['text/csv', 'application/vnd.ms-excel', 'text/plain']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['text/csv', 'application/vnd.ms-excel', 'text/plain']::text[];

-- 2. Storage RLS policies for csv-uploads
-- Drop existing policies if any to avoid conflicts
DROP POLICY IF EXISTS "Users can upload to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own uploads" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own uploads" ON storage.objects;
DROP POLICY IF EXISTS "Service role full access to csv-uploads" ON storage.objects;

-- Allow authenticated users to upload files into their own folder (userId/filename)
CREATE POLICY "Users can upload to own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'csv-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to read their own uploads
CREATE POLICY "Users can read own uploads"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'csv-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to delete their own uploads
CREATE POLICY "Users can delete own uploads"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'csv-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. upload_jobs table RLS (if not already enabled)
ALTER TABLE public.upload_jobs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view own upload jobs" ON public.upload_jobs;
DROP POLICY IF EXISTS "Users can insert own upload jobs" ON public.upload_jobs;
DROP POLICY IF EXISTS "Users can update own upload jobs" ON public.upload_jobs;
DROP POLICY IF EXISTS "Admins can view all upload jobs" ON public.upload_jobs;

-- Users can view their own jobs
CREATE POLICY "Users can view own upload jobs"
ON public.upload_jobs FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- Users can insert their own jobs
CREATE POLICY "Users can insert own upload jobs"
ON public.upload_jobs FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Users can update their own jobs (needed for status polling)
CREATE POLICY "Users can update own upload jobs"
ON public.upload_jobs FOR UPDATE
TO authenticated
USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- 4. upload_staging table RLS (used by process-upload edge fn via service role, but needs to exist)
ALTER TABLE public.upload_staging ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view upload staging" ON public.upload_staging;

-- Only admins can view staging data (edge fn uses service role key)
CREATE POLICY "Admins can view upload staging"
ON public.upload_staging FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
