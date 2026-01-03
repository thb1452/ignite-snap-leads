-- =====================================================================
-- Test Script for Property Aggregation Trigger
-- =====================================================================
-- Run this to verify the trigger is working correctly

-- 1. Create a test property
INSERT INTO properties (
  address, city, state, zip,
  total_violations, open_violations, violation_types, repeat_offender
)
VALUES (
  'test-123-trigger-validation', 'testville', 'ts', '00000',
  0, 0, ARRAY[]::TEXT[], false
)
RETURNING id, address, total_violations, open_violations;

-- Save the property_id from above, then run the tests below
-- Replace 'YOUR_PROPERTY_ID_HERE' with the actual ID

\set test_property_id 'YOUR_PROPERTY_ID_HERE'

-- 2. Check initial state (should be 0s)
SELECT
  id,
  address,
  total_violations,
  open_violations,
  violation_types,
  repeat_offender,
  last_enforcement_date
FROM properties
WHERE id = :'test_property_id';

-- 3. Insert first violation (Open status)
INSERT INTO violations (
  property_id,
  violation_type,
  status,
  opened_date,
  case_id
)
VALUES (
  :'test_property_id',
  'Exterior',
  'Open',
  '2024-01-15',
  'CASE-001'
);

-- 4. Check aggregates after first violation
-- Expected: total=1, open=1, types=['Exterior'], repeat=false
SELECT
  id,
  address,
  total_violations,           -- Should be 1
  open_violations,            -- Should be 1
  violation_types,            -- Should be {'Exterior'}
  repeat_offender,            -- Should be false (only 1 case)
  last_enforcement_date       -- Should be 2024-01-15
FROM properties
WHERE id = :'test_property_id';

-- 5. Insert second violation (Closed status, different case)
INSERT INTO violations (
  property_id,
  violation_type,
  status,
  opened_date,
  case_id
)
VALUES (
  :'test_property_id',
  'Zoning',
  'Closed',
  '2024-02-20',
  'CASE-002'
);

-- 6. Check aggregates after second violation
-- Expected: total=2, open=1, types=['Exterior','Zoning'], repeat=true
SELECT
  id,
  address,
  total_violations,           -- Should be 2
  open_violations,            -- Should be 1 (only first is Open)
  violation_types,            -- Should be {'Exterior', 'Zoning'}
  repeat_offender,            -- Should be true (2 different cases)
  last_enforcement_date       -- Should be 2024-02-20 (most recent)
FROM properties
WHERE id = :'test_property_id';

-- 7. Update violation status from Open to Closed
UPDATE violations
SET status = 'Closed'
WHERE property_id = :'test_property_id'
  AND violation_type = 'Exterior';

-- 8. Check aggregates after update
-- Expected: total=2, open=0, types=['Exterior','Zoning'], repeat=true
SELECT
  id,
  address,
  total_violations,           -- Should be 2
  open_violations,            -- Should be 0 (both closed now)
  violation_types,            -- Should be {'Exterior', 'Zoning'}
  repeat_offender,            -- Should be true (still 2 cases)
  last_enforcement_date       -- Should be 2024-02-20
FROM properties
WHERE id = :'test_property_id';

-- 9. Delete one violation
DELETE FROM violations
WHERE property_id = :'test_property_id'
  AND violation_type = 'Zoning';

-- 10. Check aggregates after delete
-- Expected: total=1, open=0, types=['Exterior'], repeat=false
SELECT
  id,
  address,
  total_violations,           -- Should be 1
  open_violations,            -- Should be 0
  violation_types,            -- Should be {'Exterior'}
  repeat_offender,            -- Should be false (only 1 case now)
  last_enforcement_date       -- Should be 2024-01-15
FROM properties
WHERE id = :'test_property_id';

-- 11. Delete all violations
DELETE FROM violations
WHERE property_id = :'test_property_id';

-- 12. Check aggregates after deleting all violations
-- Expected: total=0, open=0, types=[], repeat=false, last_date=NULL
SELECT
  id,
  address,
  total_violations,           -- Should be 0
  open_violations,            -- Should be 0
  violation_types,            -- Should be {}
  repeat_offender,            -- Should be false
  last_enforcement_date       -- Should be NULL
FROM properties
WHERE id = :'test_property_id';

-- 13. Cleanup - delete test property
DELETE FROM properties
WHERE id = :'test_property_id';

-- =====================================================================
-- RESULT EXPECTATIONS
-- =====================================================================
-- After step 4:  total=1,  open=1, types=['Exterior'],           repeat=false, date=2024-01-15
-- After step 6:  total=2,  open=1, types=['Exterior','Zoning'],  repeat=true,  date=2024-02-20
-- After step 8:  total=2,  open=0, types=['Exterior','Zoning'],  repeat=true,  date=2024-02-20
-- After step 10: total=1,  open=0, types=['Exterior'],           repeat=false, date=2024-01-15
-- After step 12: total=0,  open=0, types=[],                     repeat=false, date=NULL

-- If all steps show expected values, the trigger is working correctly!
