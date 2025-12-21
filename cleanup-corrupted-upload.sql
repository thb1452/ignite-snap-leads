-- Cleanup script for corrupted upload from 2025-12-21
-- This upload incorrectly parsed violation descriptions as city/state values

-- Step 1: Identify all corrupted upload jobs (created ~19:50-19:55 on 2025-12-21)
-- These have nonsense city/state values like "stored/PARKED ON STANDS", "WEEDS/DEBRIS", etc.

-- First, let's see what we're dealing with
SELECT
  id,
  city,
  state,
  created_at,
  status,
  properties_created,
  violations_created
FROM upload_jobs
WHERE created_at > '2025-12-21 19:45:00'::timestamptz
  AND created_at < '2025-12-21 20:00:00'::timestamptz
ORDER BY created_at DESC;

-- Step 2: Find all property IDs created from these jobs
WITH corrupted_jobs AS (
  SELECT id
  FROM upload_jobs
  WHERE created_at > '2025-12-21 19:45:00'::timestamptz
    AND created_at < '2025-12-21 20:00:00'::timestamptz
)
SELECT
  p.id,
  p.address,
  p.city,
  p.state,
  p.created_at
FROM properties p
WHERE p.id IN (
  SELECT DISTINCT property_id
  FROM upload_staging
  WHERE job_id IN (SELECT id FROM corrupted_jobs)
    AND property_id IS NOT NULL
)
ORDER BY p.created_at DESC;

-- Step 3: Count violations to be deleted
WITH corrupted_jobs AS (
  SELECT id
  FROM upload_jobs
  WHERE created_at > '2025-12-21 19:45:00'::timestamptz
    AND created_at < '2025-12-21 20:00:00'::timestamptz
),
corrupted_properties AS (
  SELECT DISTINCT property_id
  FROM upload_staging
  WHERE job_id IN (SELECT id FROM corrupted_jobs)
    AND property_id IS NOT NULL
)
SELECT COUNT(*) as violations_to_delete
FROM violations
WHERE property_id IN (SELECT property_id FROM corrupted_properties);

-- ============================================================================
-- DELETION COMMANDS (Run these after verifying the above queries look correct)
-- ============================================================================

-- Step 4: Delete violations
WITH corrupted_jobs AS (
  SELECT id
  FROM upload_jobs
  WHERE created_at > '2025-12-21 19:45:00'::timestamptz
    AND created_at < '2025-12-21 20:00:00'::timestamptz
),
corrupted_properties AS (
  SELECT DISTINCT property_id
  FROM upload_staging
  WHERE job_id IN (SELECT id FROM corrupted_jobs)
    AND property_id IS NOT NULL
)
DELETE FROM violations
WHERE property_id IN (SELECT property_id FROM corrupted_properties);

-- Step 5: Delete upload_staging
WITH corrupted_jobs AS (
  SELECT id
  FROM upload_jobs
  WHERE created_at > '2025-12-21 19:45:00'::timestamptz
    AND created_at < '2025-12-21 20:00:00'::timestamptz
)
DELETE FROM upload_staging
WHERE job_id IN (SELECT id FROM corrupted_jobs);

-- Step 6: Delete the corrupted properties
WITH corrupted_jobs AS (
  SELECT id
  FROM upload_jobs
  WHERE created_at > '2025-12-21 19:45:00'::timestamptz
    AND created_at < '2025-12-21 20:00:00'::timestamptz
),
corrupted_properties AS (
  SELECT DISTINCT property_id
  FROM upload_staging
  WHERE job_id IN (SELECT id FROM corrupted_jobs)
    AND property_id IS NOT NULL
)
DELETE FROM properties
WHERE id IN (SELECT property_id FROM corrupted_properties);

-- Step 7: Delete the upload jobs
DELETE FROM upload_jobs
WHERE created_at > '2025-12-21 19:45:00'::timestamptz
  AND created_at < '2025-12-21 20:00:00'::timestamptz;

-- Step 8: Verify cleanup
SELECT
  'Upload jobs remaining' as check_type,
  COUNT(*) as count
FROM upload_jobs
WHERE created_at > '2025-12-21 19:45:00'::timestamptz
  AND created_at < '2025-12-21 20:00:00'::timestamptz
UNION ALL
SELECT
  'Properties with bad cities' as check_type,
  COUNT(*) as count
FROM properties
WHERE city IN ('stored', 'WEEDS', 'State Police', 'debris', '1.', '3.', '4.', 'integrity')
  OR state IN ('PARKED ON STANDS', 'DEBRIS', 'LOCAL NEWS', 'AND JUNK');
