-- =====================================================================
-- QUICK STATUS CHECK - Run this to see current state
-- =====================================================================

-- 1. Check if trigger function exists
SELECT
  'Trigger Function Exists' as check_name,
  CASE
    WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_property_aggregates')
    THEN '✅ YES'
    ELSE '❌ NO'
  END as status;

-- 2. Check if trigger is enabled
SELECT
  'Trigger Enabled' as check_name,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'property_aggregates_trigger' AND tgenabled = 'O'
    )
    THEN '✅ YES'
    ELSE '❌ NO'
  END as status;

-- 3. Count properties with violations
SELECT
  COUNT(*) as total_properties,
  COUNT(*) FILTER (WHERE total_violations > 0) as properties_with_violations,
  COUNT(*) FILTER (WHERE open_violations > 0) as properties_with_open_violations,
  COUNT(*) FILTER (WHERE repeat_offender = true) as repeat_offenders,
  ROUND(100.0 * COUNT(*) FILTER (WHERE total_violations > 0) / NULLIF(COUNT(*), 0), 2) as percent_with_violations
FROM properties;

-- 4. Sample properties with violations
SELECT
  id,
  address,
  city,
  state,
  total_violations,
  open_violations,
  repeat_offender,
  ARRAY_LENGTH(violation_types, 1) as type_count,
  last_enforcement_date
FROM properties
WHERE total_violations > 0
LIMIT 5;

-- 5. Test filter queries
SELECT 'Open Violations Filter' as filter_name, COUNT(*) as result_count
FROM properties WHERE open_violations > 0
UNION ALL
SELECT 'Multiple Violations Filter', COUNT(*)
FROM properties WHERE total_violations > 1
UNION ALL
SELECT 'Repeat Offender Filter', COUNT(*)
FROM properties WHERE repeat_offender = true;
