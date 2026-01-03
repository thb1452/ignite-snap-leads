-- =====================================================================
-- Automatic Property Aggregation Trigger
-- =====================================================================
-- This trigger automatically recalculates property aggregates whenever
-- violations are inserted, updated, or deleted.
--
-- Aggregates calculated:
-- - total_violations: COUNT(*)
-- - open_violations: COUNT WHERE status = 'Open'
-- - violation_types: ARRAY_AGG(DISTINCT violation_type)
-- - repeat_offender: COUNT(DISTINCT case_id) > 1
-- - last_enforcement_date: MAX(opened_date)
--
-- Handles edge cases:
-- - All violations deleted → sets counts to 0, arrays to empty
-- - Property doesn't exist → skips update
-- - NULL values → filters them out appropriately
-- =====================================================================

-- Create the trigger function
CREATE OR REPLACE FUNCTION update_property_aggregates()
RETURNS TRIGGER AS $$
DECLARE
  affected_property_id UUID;
  v_total_violations INTEGER;
  v_open_violations INTEGER;
  v_violation_types TEXT[];
  v_repeat_offender BOOLEAN;
  v_last_enforcement_date TIMESTAMPTZ;
  v_unique_case_count INTEGER;
BEGIN
  -- Determine which property_id was affected
  -- For DELETE, use OLD.property_id
  -- For INSERT/UPDATE, use NEW.property_id
  IF (TG_OP = 'DELETE') THEN
    affected_property_id := OLD.property_id;
  ELSE
    affected_property_id := NEW.property_id;
  END IF;

  -- Skip if property_id is NULL
  IF affected_property_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Recalculate all aggregates for this property
  -- Use a single query for efficiency
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE LOWER(TRIM(status)) = 'open'),
    ARRAY_AGG(DISTINCT violation_type) FILTER (WHERE violation_type IS NOT NULL AND TRIM(violation_type) != ''),
    COUNT(DISTINCT case_id) FILTER (WHERE case_id IS NOT NULL AND TRIM(case_id) != ''),
    MAX(opened_date)
  INTO
    v_total_violations,
    v_open_violations,
    v_violation_types,
    v_unique_case_count,
    v_last_enforcement_date
  FROM violations
  WHERE property_id = affected_property_id;

  -- Handle case where property has no violations
  IF v_total_violations IS NULL THEN
    v_total_violations := 0;
    v_open_violations := 0;
    v_violation_types := ARRAY[]::TEXT[];
    v_unique_case_count := 0;
    v_last_enforcement_date := NULL;
  END IF;

  -- Handle NULL array (when no valid violation types)
  IF v_violation_types IS NULL THEN
    v_violation_types := ARRAY[]::TEXT[];
  END IF;

  -- Determine repeat offender status
  -- A property is a repeat offender if it has violations from multiple cases
  v_repeat_offender := (v_unique_case_count > 1);

  -- Update the properties table
  -- Use ON CONFLICT DO NOTHING in case property was deleted
  UPDATE properties
  SET
    total_violations = v_total_violations,
    open_violations = v_open_violations,
    violation_types = v_violation_types,
    repeat_offender = v_repeat_offender,
    last_enforcement_date = v_last_enforcement_date,
    updated_at = NOW()
  WHERE id = affected_property_id;

  -- Log for debugging (optional - comment out in production)
  RAISE NOTICE 'Updated property % aggregates: total=%, open=%, types=%, repeat=%, last_date=%',
    affected_property_id,
    v_total_violations,
    v_open_violations,
    ARRAY_LENGTH(v_violation_types, 1),
    v_repeat_offender,
    v_last_enforcement_date;

  -- Return the appropriate row
  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the violation operation
    RAISE WARNING 'Error updating property aggregates for property %: %', affected_property_id, SQLERRM;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS property_aggregates_trigger ON violations;

CREATE TRIGGER property_aggregates_trigger
  AFTER INSERT OR UPDATE OR DELETE ON violations
  FOR EACH ROW
  EXECUTE FUNCTION update_property_aggregates();

-- Add helpful comment
COMMENT ON FUNCTION update_property_aggregates() IS
  'Automatically recalculates property aggregates when violations change. '
  'Keeps total_violations, open_violations, violation_types, repeat_offender, and last_enforcement_date in sync.';

-- =====================================================================
-- ONE-TIME BACKFILL: Update all existing properties
-- =====================================================================
-- This recalculates aggregates for all properties that have violations
-- Run this once after creating the trigger to fix existing data

DO $$
DECLARE
  property_record RECORD;
  updated_count INTEGER := 0;
  total_count INTEGER;
BEGIN
  -- Get total count for progress tracking
  SELECT COUNT(DISTINCT property_id) INTO total_count
  FROM violations
  WHERE property_id IS NOT NULL;

  RAISE NOTICE 'Starting backfill for % properties with violations...', total_count;

  -- Loop through each property with violations
  FOR property_record IN
    SELECT DISTINCT property_id
    FROM violations
    WHERE property_id IS NOT NULL
  LOOP
    -- Update this property's aggregates
    UPDATE properties
    SET
      total_violations = (
        SELECT COUNT(*)
        FROM violations
        WHERE property_id = property_record.property_id
      ),
      open_violations = (
        SELECT COUNT(*)
        FROM violations
        WHERE property_id = property_record.property_id
          AND LOWER(TRIM(status)) = 'open'
      ),
      violation_types = (
        SELECT ARRAY_AGG(DISTINCT violation_type)
        FROM violations
        WHERE property_id = property_record.property_id
          AND violation_type IS NOT NULL
          AND TRIM(violation_type) != ''
      ),
      repeat_offender = (
        SELECT COUNT(DISTINCT case_id) > 1
        FROM violations
        WHERE property_id = property_record.property_id
          AND case_id IS NOT NULL
          AND TRIM(case_id) != ''
      ),
      last_enforcement_date = (
        SELECT MAX(opened_date)
        FROM violations
        WHERE property_id = property_record.property_id
      ),
      updated_at = NOW()
    WHERE id = property_record.property_id;

    updated_count := updated_count + 1;

    -- Progress update every 1000 properties
    IF updated_count % 1000 = 0 THEN
      RAISE NOTICE 'Progress: %/% properties updated', updated_count, total_count;
    END IF;
  END LOOP;

  RAISE NOTICE 'Backfill complete! Updated % properties.', updated_count;
END $$;

-- =====================================================================
-- Verification Queries
-- =====================================================================

-- Check how many properties now have aggregates
SELECT
  COUNT(*) as total_properties,
  COUNT(*) FILTER (WHERE total_violations > 0) as with_violations,
  COUNT(*) FILTER (WHERE open_violations > 0) as with_open_violations,
  COUNT(*) FILTER (WHERE repeat_offender = true) as repeat_offenders,
  COUNT(*) FILTER (WHERE last_enforcement_date IS NOT NULL) as with_enforcement_dates,
  AVG(total_violations) FILTER (WHERE total_violations > 0) as avg_violations_per_property
FROM properties;

-- Sample check: Compare aggregates vs actual violations
SELECT
  p.id,
  p.address,
  p.city,
  p.state,
  -- Aggregated values
  p.total_violations as agg_total,
  p.open_violations as agg_open,
  p.violation_types as agg_types,
  p.repeat_offender as agg_repeat,
  -- Actual values (should match)
  (SELECT COUNT(*) FROM violations WHERE property_id = p.id) as actual_total,
  (SELECT COUNT(*) FROM violations WHERE property_id = p.id AND LOWER(TRIM(status)) = 'open') as actual_open,
  (SELECT COUNT(DISTINCT case_id) > 1 FROM violations WHERE property_id = p.id) as actual_repeat
FROM properties p
WHERE p.total_violations > 0
LIMIT 10;
