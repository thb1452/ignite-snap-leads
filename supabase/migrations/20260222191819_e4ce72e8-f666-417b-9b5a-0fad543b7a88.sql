
CREATE OR REPLACE FUNCTION public.fn_backfill_zips_by_city_mode(p_city TEXT, p_state TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode_zip TEXT;
  v_updated INTEGER := 0;
  v_rec RECORD;
  v_existing_id UUID;
BEGIN
  -- Find the most common ZIP for this city/state
  SELECT zip INTO v_mode_zip
  FROM properties
  WHERE LOWER(city) = LOWER(p_city)
    AND LOWER(state) = LOWER(p_state)
    AND zip IS NOT NULL AND zip != ''
  GROUP BY zip
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  IF v_mode_zip IS NULL THEN
    RETURN 0;
  END IF;

  -- Process each property missing a ZIP
  FOR v_rec IN
    SELECT id, address FROM properties
    WHERE LOWER(city) = LOWER(p_city)
      AND LOWER(state) = LOWER(p_state)
      AND (zip IS NULL OR zip = '')
  LOOP
    -- Check if assigning this ZIP would conflict
    SELECT id INTO v_existing_id
    FROM properties
    WHERE LOWER(TRIM(address)) = LOWER(TRIM(v_rec.address))
      AND LOWER(TRIM(city)) = LOWER(TRIM(p_city))
      AND LOWER(TRIM(state)) = LOWER(TRIM(p_state))
      AND LOWER(TRIM(zip)) = LOWER(TRIM(v_mode_zip))
      AND id != v_rec.id
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      -- Merge: reassign violations from duplicate to existing
      UPDATE violations SET property_id = v_existing_id WHERE property_id = v_rec.id;
      -- Reassign other linked records
      UPDATE lead_activity SET property_id = v_existing_id WHERE property_id = v_rec.id;
      UPDATE list_properties SET property_id = v_existing_id WHERE property_id = v_rec.id;
      UPDATE property_contacts SET property_id = v_existing_id WHERE property_id = v_rec.id;
      UPDATE call_logs SET property_id = v_existing_id WHERE property_id = v_rec.id;
      -- Delete the duplicate
      DELETE FROM properties WHERE id = v_rec.id;
    ELSE
      -- Safe to update
      UPDATE properties SET zip = v_mode_zip WHERE id = v_rec.id;
    END IF;
    v_updated := v_updated + 1;
  END LOOP;

  RETURN v_updated;
END;
$$;
