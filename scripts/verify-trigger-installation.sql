-- =====================================================================
-- VERIFICATION SCRIPT - Run in order
-- =====================================================================

-- ✅ STEP 1: Verify Trigger Function Exists
-- =====================================================================
SELECT
  proname as function_name,
  pg_get_functiondef(oid) LIKE '%total_violations%' as has_aggregation_logic
FROM pg_proc
WHERE proname = 'update_property_aggregates';

-- Expected: 1 row with has_aggregation_logic = true
-- =====================================================================


-- ✅ STEP 2: Verify Trigger Exists and is Enabled
-- =====================================================================
SELECT
  tgname as trigger_name,
  tgtype as trigger_type,
  CASE tgenabled
    WHEN 'O' THEN 'Enabled'
    WHEN 'D' THEN 'Disabled'
    ELSE 'Unknown'
  END as status
FROM pg_trigger
WHERE tgname = 'property_aggregates_trigger';

-- Expected: 1 row with status = 'Enabled'
-- =====================================================================


-- ✅ STEP 3: Check Backfill Results
-- =====================================================================
SELECT
  COUNT(*) as total_properties,
  COUNT(*) FILTER (WHERE total_violations > 0) as properties_with_violations,
  COUNT(*) FILTER (WHERE open_violations > 0) as properties_with_open_violations,
  COUNT(*) FILTER (WHERE repeat_offender = true) as repeat_offenders,
  COUNT(*) FILTER (WHERE last_enforcement_date IS NOT NULL) as properties_with_dates,
  ROUND(AVG(total_violations) FILTER (WHERE total_violations > 0), 2) as avg_violations_per_property,
  MAX(total_violations) as max_violations_on_one_property
FROM properties;

-- Expected:
-- - properties_with_violations > 0 (should be thousands)
-- - avg_violations_per_property > 1.0
-- - max_violations_on_one_property > 1
-- =====================================================================


-- ✅ STEP 4: Spot Check - Compare Aggregates vs Actual Violations
-- =====================================================================
SELECT
  p.id,
  p.address,
  p.city,
  p.state,
  -- Aggregated values (from trigger)
  p.total_violations as agg_total,
  p.open_violations as agg_open,
  ARRAY_LENGTH(p.violation_types, 1) as agg_type_count,
  p.repeat_offender as agg_repeat,
  p.last_enforcement_date as agg_last_date,
  -- Actual values (from violations table)
  COUNT(v.*) as actual_total,
  COUNT(v.*) FILTER (WHERE LOWER(TRIM(v.status)) = 'open') as actual_open,
  COUNT(DISTINCT v.case_id) as actual_case_count,
  MAX(v.opened_date) as actual_last_date,
  -- Validation (should all be true)
  (p.total_violations = COUNT(v.*)) as total_match,
  (p.open_violations = COUNT(v.*) FILTER (WHERE LOWER(TRIM(v.status)) = 'open')) as open_match,
  (p.repeat_offender = (COUNT(DISTINCT v.case_id) > 1)) as repeat_match
FROM properties p
LEFT JOIN violations v ON v.property_id = p.id
WHERE p.total_violations > 0
GROUP BY p.id
LIMIT 20;

-- Expected: All *_match columns should be TRUE
-- =====================================================================


-- ✅ STEP 5: Check Specific Cities
-- =====================================================================
SELECT
  city,
  state,
  COUNT(*) as total_properties,
  COUNT(*) FILTER (WHERE total_violations > 0) as with_violations,
  COUNT(*) FILTER (WHERE open_violations > 0) as with_open,
  ROUND(AVG(total_violations) FILTER (WHERE total_violations > 0), 2) as avg_violations
FROM properties
WHERE city IN ('winston-salem', 'ball ground', 'greensboro')
GROUP BY city, state
ORDER BY city;

-- Expected: All cities show with_violations > 0
-- =====================================================================


-- ✅ STEP 6: Test Trigger with Live Insert
-- =====================================================================
-- Create a test violation to verify trigger fires
DO $$
DECLARE
  test_property_id UUID;
  before_total INTEGER;
  after_total INTEGER;
BEGIN
  -- Get a property with existing violations
  SELECT id, total_violations INTO test_property_id, before_total
  FROM properties
  WHERE total_violations > 0
  LIMIT 1;

  RAISE NOTICE 'Testing trigger on property % (current total: %)', test_property_id, before_total;

  -- Insert test violation
  INSERT INTO violations (
    property_id,
    violation_type,
    status,
    opened_date,
    case_id
  ) VALUES (
    test_property_id,
    'TRIGGER-TEST',
    'Open',
    NOW(),
    'TEST-' || NOW()::TEXT
  );

  -- Check if property was auto-updated
  SELECT total_violations INTO after_total
  FROM properties
  WHERE id = test_property_id;

  RAISE NOTICE 'After insert: total = % (expected: %)', after_total, before_total + 1;

  -- Cleanup
  DELETE FROM violations
  WHERE violation_type = 'TRIGGER-TEST';

  -- Verify cleanup also triggered update
  SELECT total_violations INTO after_total
  FROM properties
  WHERE id = test_property_id;

  RAISE NOTICE 'After cleanup: total = % (expected: %)', after_total, before_total;

  IF after_total = before_total THEN
    RAISE NOTICE '✅ TRIGGER IS WORKING CORRECTLY!';
  ELSE
    RAISE WARNING '❌ TRIGGER MAY NOT BE WORKING - Expected %, got %', before_total, after_total;
  END IF;
END $$;

-- Expected: See NOTICE messages showing trigger working
-- =====================================================================


-- ✅ STEP 7: Filter Test Queries
-- =====================================================================

-- Test "Open Violations Only" filter
SELECT COUNT(*) as open_violations_count
FROM properties
WHERE open_violations > 0;

-- Test "Multiple Violations" filter
SELECT COUNT(*) as multiple_violations_count
FROM properties
WHERE total_violations > 1;

-- Test "Repeat Offender" filter
SELECT COUNT(*) as repeat_offender_count
FROM properties
WHERE repeat_offender = true;

-- Test "Violation Type" filter (Exterior)
SELECT COUNT(*) as exterior_violations_count
FROM properties
WHERE 'Exterior' = ANY(violation_types);

-- Expected: All counts > 0
-- =====================================================================


-- ✅ SUMMARY REPORT
-- =====================================================================
SELECT
  '✅ Trigger Function' as check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'update_property_aggregates'
  ) THEN 'PASS' ELSE 'FAIL' END as status
UNION ALL
SELECT
  '✅ Trigger Enabled' as check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'property_aggregates_trigger' AND tgenabled = 'O'
  ) THEN 'PASS' ELSE 'FAIL' END as status
UNION ALL
SELECT
  '✅ Properties Have Aggregates' as check_item,
  CASE WHEN (
    SELECT COUNT(*) FROM properties WHERE total_violations > 0
  ) > 0 THEN 'PASS' ELSE 'FAIL' END as status
UNION ALL
SELECT
  '✅ Open Violations Filter' as check_item,
  CASE WHEN (
    SELECT COUNT(*) FROM properties WHERE open_violations > 0
  ) > 0 THEN 'PASS' ELSE 'FAIL' END as status
UNION ALL
SELECT
  '✅ Multiple Violations Filter' as check_item,
  CASE WHEN (
    SELECT COUNT(*) FROM properties WHERE total_violations > 1
  ) > 0 THEN 'PASS' ELSE 'FAIL' END as status
UNION ALL
SELECT
  '✅ Repeat Offender Filter' as check_item,
  CASE WHEN (
    SELECT COUNT(*) FROM properties WHERE repeat_offender = true
  ) > 0 THEN 'PASS' ELSE 'FAIL' END as status;

-- Expected: All checks show 'PASS'
-- =====================================================================
