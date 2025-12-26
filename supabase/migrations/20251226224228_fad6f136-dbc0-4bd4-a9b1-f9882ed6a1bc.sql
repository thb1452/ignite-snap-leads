-- Bulk lifecycle-aware upsert function for violations
-- Accepts JSONB array, processes all in one transaction
-- Returns count of inserted vs updated records

CREATE OR REPLACE FUNCTION bulk_upsert_violations(p_violations JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INT := 0;
  v_updated INT := 0;
  v_violation JSONB;
  v_existing RECORD;
  v_property_id UUID;
  v_case_id TEXT;
  v_status TEXT;
BEGIN
  FOR v_violation IN SELECT * FROM jsonb_array_elements(p_violations)
  LOOP
    v_property_id := (v_violation->>'property_id')::UUID;
    v_case_id := v_violation->>'case_id';
    v_status := COALESCE(v_violation->>'status', 'Open');
    
    -- Skip if no property_id
    IF v_property_id IS NULL THEN
      CONTINUE;
    END IF;
    
    -- Check for existing violation (only if case_id is not null)
    IF v_case_id IS NOT NULL AND v_case_id != '' THEN
      SELECT id, status INTO v_existing
      FROM violations
      WHERE property_id = v_property_id AND case_id = v_case_id;
    ELSE
      v_existing := NULL;
    END IF;
    
    IF v_existing.id IS NOT NULL THEN
      -- UPDATE existing - track lifecycle changes
      UPDATE violations SET
        violation_type = COALESCE(v_violation->>'violation_type', violation_type),
        description = COALESCE(v_violation->>'description', description),
        raw_description = COALESCE(v_violation->>'raw_description', raw_description),
        previous_status = CASE 
          WHEN status != v_status THEN status 
          ELSE previous_status 
        END,
        status_changed_at = CASE 
          WHEN status != v_status THEN now() 
          ELSE status_changed_at 
        END,
        status = v_status,
        opened_date = COALESCE((v_violation->>'opened_date')::DATE, opened_date),
        last_updated = COALESCE((v_violation->>'last_updated')::DATE, last_updated),
        days_open = COALESCE((v_violation->>'days_open')::INT, days_open),
        last_seen_at = now(),
        closed_at = CASE 
          WHEN v_status = 'Closed' AND status != 'Closed' THEN CURRENT_DATE 
          ELSE closed_at 
        END
      WHERE id = v_existing.id;
      
      v_updated := v_updated + 1;
    ELSE
      -- INSERT new violation
      INSERT INTO violations (
        property_id, case_id, violation_type, description, raw_description,
        status, opened_date, last_updated, days_open, first_seen_at, last_seen_at
      ) VALUES (
        v_property_id,
        NULLIF(v_case_id, ''),
        COALESCE(v_violation->>'violation_type', 'Unknown'),
        v_violation->>'description',
        v_violation->>'raw_description',
        v_status,
        (v_violation->>'opened_date')::DATE,
        (v_violation->>'last_updated')::DATE,
        (v_violation->>'days_open')::INT,
        now(),
        now()
      );
      
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'updated', v_updated,
    'total', v_inserted + v_updated
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION bulk_upsert_violations(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION bulk_upsert_violations(JSONB) TO service_role;