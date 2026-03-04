
CREATE OR REPLACE FUNCTION public.fn_fix_city_names(mappings jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  m jsonb;
  old_city_val text;
  old_state_val text;
  new_city_val text;
  total_updated int := 0;
  total_merged int := 0;
  merge_count int;
  update_count int;
  dup record;
BEGIN
  FOR m IN SELECT * FROM jsonb_array_elements(mappings)
  LOOP
    old_city_val := m->>'old_city';
    old_state_val := m->>'old_state';
    new_city_val := m->>'new_city';

    -- Step 1: Handle duplicates - find old-city rows that would conflict
    -- Reassign child records and delete duplicates in bulk
    FOR dup IN
      SELECT old_p.id AS old_id, keeper.id AS keeper_id
      FROM properties old_p
      JOIN properties keeper
        ON UPPER(TRIM(keeper.address)) = UPPER(TRIM(old_p.address))
        AND UPPER(TRIM(keeper.city)) = UPPER(TRIM(new_city_val))
        AND UPPER(TRIM(keeper.state)) = UPPER(TRIM(old_p.state))
        AND keeper.id != old_p.id
      WHERE UPPER(TRIM(old_p.city)) = UPPER(TRIM(old_city_val))
        AND UPPER(TRIM(old_p.state)) = UPPER(TRIM(old_state_val))
    LOOP
      UPDATE lead_activity SET property_id = dup.keeper_id WHERE property_id = dup.old_id;
      UPDATE list_properties SET property_id = dup.keeper_id WHERE property_id = dup.old_id;
      UPDATE call_logs SET property_id = dup.keeper_id WHERE property_id = dup.old_id;
      UPDATE property_contacts SET property_id = dup.keeper_id WHERE property_id = dup.old_id;
      UPDATE saved_properties SET property_id = dup.keeper_id WHERE property_id = dup.old_id;
      DELETE FROM clean_leads WHERE property_id = dup.old_id;
      DELETE FROM properties WHERE id = dup.old_id;
      total_merged := total_merged + 1;
    END LOOP;

    -- Step 2: Bulk rename remaining (non-conflicting) rows
    UPDATE properties
    SET city = new_city_val
    WHERE UPPER(TRIM(city)) = UPPER(TRIM(old_city_val))
      AND UPPER(TRIM(state)) = UPPER(TRIM(old_state_val));
    GET DIAGNOSTICS update_count = ROW_COUNT;
    total_updated := total_updated + update_count;
  END LOOP;

  RETURN jsonb_build_object('updated', total_updated, 'merged', total_merged);
END;
$$;
