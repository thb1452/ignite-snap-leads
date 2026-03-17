-- =====================================================================
-- DIAGNOSE: "No active enforcement actions" insight spread
-- Run these in order in Supabase SQL Editor.
-- =====================================================================

-- 1. Are violations still in the database?
SELECT COUNT(*) AS total_violations FROM violations;
SELECT COUNT(*) AS violations_with_property_id FROM violations WHERE property_id IS NOT NULL;

-- Expected: these should match the import count. If dramatically lower
-- than expected, the violations table itself was affected (data loss).
-- Our backfill changes do NOT touch the violations table at all.

-- =====================================================================

-- 2. How many properties have the stale "No active" insight?
SELECT COUNT(*) AS stale_no_action_insight_count
FROM properties
WHERE snap_insight = 'No active enforcement actions currently on file.';

-- =====================================================================

-- 3. CRITICAL — of those properties, how many actually HAVE violations?
--    If this > 0, the insight was generated incorrectly and needs repair.
--    If this = 0, those properties genuinely have no violations and the
--    insight text is correct (no action needed).
SELECT COUNT(*) AS stale_but_have_violations
FROM properties p
WHERE p.snap_insight = 'No active enforcement actions currently on file.'
  AND EXISTS (
    SELECT 1 FROM violations v WHERE v.property_id = p.id
  );

-- =====================================================================

-- 4. Sample of affected properties — check if violations exist for them
SELECT
  p.id,
  p.address,
  p.city,
  p.state,
  p.total_violations    AS cached_total_violations,
  p.snap_score,
  p.snap_insight,
  (SELECT COUNT(*) FROM violations v WHERE v.property_id = p.id) AS actual_violation_count
FROM properties p
WHERE p.snap_insight = 'No active enforcement actions currently on file.'
ORDER BY (SELECT COUNT(*) FROM violations v WHERE v.property_id = p.id) DESC
LIMIT 20;

-- If actual_violation_count > 0 for any rows → those properties need
-- their insights repaired via the repair function below.

-- =====================================================================

-- 5. Verify violations are properly linked (check FK integrity)
SELECT
  COUNT(*)                                              AS total_violations,
  COUNT(v.property_id)                                 AS with_property_id,
  COUNT(p.id)                                          AS with_valid_property_fk
FROM violations v
LEFT JOIN properties p ON p.id = v.property_id;

-- If with_valid_property_fk is much lower than total_violations, there
-- are orphaned violation records (property_id set but property doesn't exist).

-- =====================================================================

-- 6. Overall backfill health check
SELECT
  COUNT(*)                                              AS total_properties,
  COUNT(*) FILTER (WHERE total_violations IS NULL)      AS unsynced_null,
  COUNT(*) FILTER (WHERE total_violations = 0)          AS synced_zero_violations,
  COUNT(*) FILTER (WHERE total_violations > 0)          AS synced_with_violations,
  COUNT(*) FILTER (WHERE snap_insight IS NULL)          AS missing_insight,
  COUNT(*) FILTER (
    WHERE snap_insight = 'No active enforcement actions currently on file.'
  )                                                     AS stale_no_action_insight,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE total_violations IS NOT NULL)
    / NULLIF(COUNT(*), 0), 1
  )                                                     AS pct_backfilled
FROM properties;
