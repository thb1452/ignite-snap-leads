
CREATE OR REPLACE FUNCTION public.fn_fix_city_names(mappings jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m jsonb;
  old_city_val text;
  old_state_val text;
  new_city_val text;
  total_updated int := 0;
  total_merged int := 0;
  prop_row record;
  keeper_id uuid;
BEGIN
  FOR m IN SELECT * FROM jsonb_array_elements(mappings)
  LOOP
    old_city_val := m->>'old_city';
    old_state_val := m->>'old_state';
    new_city_val := m->>'new_city';

    -- For each property with the old city name, check if a property with
    -- the same address + new_city + state already exists
    FOR prop_row IN
      SELECT id, address, state
      FROM properties
      WHERE UPPER(TRIM(city)) = UPPER(TRIM(old_city_val))
        AND UPPER(TRIM(state)) = UPPER(TRIM(old_state_val))
    LOOP
      -- Check if a "keeper" already exists with the corrected city name
      SELECT p.id INTO keeper_id
      FROM properties p
      WHERE UPPER(TRIM(p.address)) = UPPER(TRIM(prop_row.address))
        AND UPPER(TRIM(p.city)) = UPPER(TRIM(new_city_val))
        AND UPPER(TRIM(p.state)) = UPPER(TRIM(prop_row.state))
        AND p.id != prop_row.id
      LIMIT 1;

      IF keeper_id IS NOT NULL THEN
        -- Merge: reassign child records to the keeper, then delete the duplicate
        UPDATE lead_activity SET property_id = keeper_id WHERE property_id = prop_row.id;
        UPDATE list_properties SET property_id = keeper_id WHERE property_id = prop_row.id;
        UPDATE call_logs SET property_id = keeper_id WHERE property_id = prop_row.id;
        UPDATE property_contacts SET property_id = keeper_id WHERE property_id = prop_row.id;
        UPDATE saved_properties SET property_id = keeper_id WHERE property_id = prop_row.id;
        DELETE FROM clean_leads WHERE property_id = prop_row.id;
        DELETE FROM properties WHERE id = prop_row.id;
        total_merged := total_merged + 1;
      ELSE
        -- No conflict, just rename
        UPDATE properties SET city = new_city_val WHERE id = prop_row.id;
        total_updated := total_updated + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('updated', total_updated, 'merged', total_merged);
END;
$$;
