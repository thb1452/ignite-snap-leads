BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
-- Candidate BODY ONLY, not a standalone release; no BEGIN/COMMIT in this file.
-- Root must use a reviewed enclosing transaction ending in ROLLBACK for rehearsal.
-- A later explicit deployment wrapper may commit only after the complete release is ready.
-- Native preimage: 2026-09-09T12:53:21.341271+00:00.
DO $bucket_json_extension$
DECLARE
  before_row jsonb; after_row jsonb;
  expected_old text[] := ARRAY['text/csv','application/vnd.ms-excel'];
  expected_new text[] := ARRAY['text/csv','application/vnd.ms-excel','application/json'];
  actual_types text[];
BEGIN
  SELECT to_jsonb(b),b.allowed_mime_types INTO STRICT before_row,actual_types
  FROM storage.buckets b WHERE b.id='csv-uploads' FOR UPDATE;
  IF before_row->>'name' IS DISTINCT FROM 'csv-uploads'
     OR before_row->'public' IS DISTINCT FROM 'false'::jsonb
     OR before_row->>'file_size_limit' IS DISTINCT FROM '52428800'
     OR before_row->>'type' IS DISTINCT FROM 'STANDARD'
     OR before_row->>'versioning_status' IS DISTINCT FROM 'DISABLED' THEN
    RAISE EXCEPTION 'csv-uploads protected native preimage differs';
  END IF;
  IF actual_types IS NOT DISTINCT FROM expected_new THEN
    RAISE NOTICE 'csv-uploads JSON extension already exactly present; no update';
    RETURN;
  END IF;
  IF actual_types IS DISTINCT FROM expected_old THEN
    RAISE EXCEPTION 'csv-uploads MIME array differs; refuse overwrite';
  END IF;
  UPDATE storage.buckets SET allowed_mime_types=array_append(allowed_mime_types,'application/json')
  WHERE id='csv-uploads';
  SELECT to_jsonb(b) INTO STRICT after_row FROM storage.buckets b WHERE b.id='csv-uploads';
  IF after_row->'allowed_mime_types' IS DISTINCT FROM to_jsonb(expected_new)
     OR (after_row - 'allowed_mime_types' - 'updated_at') IS DISTINCT FROM
        (before_row - 'allowed_mime_types' - 'updated_at') THEN
    RAISE EXCEPTION 'csv-uploads extension changed an unrelated property';
  END IF;
END $bucket_json_extension$;

COMMIT;
