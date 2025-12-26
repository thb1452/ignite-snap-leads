-- Drop and recreate bulk_upsert_violations function with fixed RECORD handling
DROP FUNCTION IF EXISTS public.bulk_upsert_violations(JSONB);

CREATE OR REPLACE FUNCTION public.bulk_upsert_violations(p_violations JSONB)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_existing_id UUID;
  v_existing_status TEXT;
  v_existing_status_changed_at TIMESTAMPTZ;
  v_existing_previous_status TEXT;
  v_property_id UUID;
  v_violation_type TEXT;
  v_case_id TEXT;
  v_status TEXT;
  v_opened_date DATE;
  v_last_updated TIMESTAMPTZ;
  v_description TEXT;
  v_raw_description TEXT;
  v_result JSON;
  v_inserted INT := 0;
  v_updated INT := 0;
  v_errors TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_violations)
  LOOP
    BEGIN
      -- Extract fields
      v_property_id := (v_item->>'property_id')::UUID;
      v_violation_type := v_item->>'violation_type';
      v_case_id := v_item->>'case_id';
      v_status := COALESCE(v_item->>'status', 'Open');
      v_opened_date := (v_item->>'opened_date')::DATE;
      v_last_updated := (v_item->>'last_updated')::TIMESTAMPTZ;
      v_description := v_item->>'description';
      v_raw_description := v_item->>'raw_description';

      -- Reset existing vars
      v_existing_id := NULL;
      v_existing_status := NULL;
      v_existing_status_changed_at := NULL;
      v_existing_previous_status := NULL;

      -- Check for existing violation
      SELECT id, status, status_changed_at, previous_status
      INTO v_existing_id, v_existing_status, v_existing_status_changed_at, v_existing_previous_status
      FROM violations
      WHERE property_id = v_property_id
        AND violation_type = v_violation_type
        AND (case_id = v_case_id OR (case_id IS NULL AND v_case_id IS NULL))
      LIMIT 1;

      IF v_existing_id IS NOT NULL THEN
        -- Update existing violation with lifecycle tracking
        UPDATE violations SET
          status = v_status,
          previous_status = CASE 
            WHEN v_existing_status != v_status THEN v_existing_status 
            ELSE v_existing_previous_status 
          END,
          status_changed_at = CASE 
            WHEN v_existing_status != v_status THEN NOW() 
            ELSE v_existing_status_changed_at 
          END,
          closed_at = CASE 
            WHEN v_status IN ('Closed', 'Resolved', 'Complied') AND v_existing_status NOT IN ('Closed', 'Resolved', 'Complied') THEN NOW()::DATE
            WHEN v_status NOT IN ('Closed', 'Resolved', 'Complied') THEN NULL
            ELSE closed_at
          END,
          last_updated = COALESCE(v_last_updated, NOW())::DATE,
          last_seen_at = NOW(),
          description = COALESCE(v_description, description),
          raw_description = COALESCE(v_raw_description, raw_description),
          days_open = CASE 
            WHEN v_status NOT IN ('Closed', 'Resolved', 'Complied') AND opened_date IS NOT NULL 
            THEN EXTRACT(DAY FROM NOW() - opened_date)::INT
            ELSE days_open
          END
        WHERE id = v_existing_id;
        
        v_updated := v_updated + 1;
      ELSE
        -- Insert new violation
        INSERT INTO violations (
          property_id,
          violation_type,
          case_id,
          status,
          opened_date,
          last_updated,
          description,
          raw_description,
          first_seen_at,
          last_seen_at,
          days_open
        ) VALUES (
          v_property_id,
          v_violation_type,
          v_case_id,
          v_status,
          v_opened_date,
          COALESCE(v_last_updated, NOW())::DATE,
          v_description,
          v_raw_description,
          NOW(),
          NOW(),
          CASE 
            WHEN v_opened_date IS NOT NULL 
            THEN EXTRACT(DAY FROM NOW() - v_opened_date)::INT
            ELSE NULL
          END
        );
        
        v_inserted := v_inserted + 1;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_errors := array_append(v_errors, 'Row error: ' || SQLERRM);
    END;
  END LOOP;

  v_result := json_build_object(
    'inserted', v_inserted,
    'updated', v_updated,
    'errors', v_errors
  );

  RETURN v_result;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.bulk_upsert_violations(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_upsert_violations(JSONB) TO service_role;