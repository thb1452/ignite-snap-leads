-- Create a function to bulk upsert properties using ON CONFLICT DO NOTHING
-- This is much faster than inserting one-by-one when duplicates exist
CREATE OR REPLACE FUNCTION public.fn_bulk_insert_properties(p_properties JSONB)
RETURNS TABLE (
  address TEXT,
  city TEXT, 
  state TEXT,
  zip TEXT,
  property_id UUID,
  was_created BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prop JSONB;
  inserted_id UUID;
  existing_id UUID;
BEGIN
  FOR prop IN SELECT * FROM jsonb_array_elements(p_properties)
  LOOP
    -- First try to find existing property
    SELECT id INTO existing_id
    FROM properties p
    WHERE LOWER(TRIM(p.address)) = LOWER(TRIM(prop->>'address'))
      AND LOWER(TRIM(p.city)) = LOWER(TRIM(prop->>'city'))
      AND LOWER(TRIM(p.state)) = LOWER(TRIM(prop->>'state'));
    
    IF existing_id IS NOT NULL THEN
      -- Property already exists
      address := prop->>'address';
      city := prop->>'city';
      state := prop->>'state';
      zip := prop->>'zip';
      property_id := existing_id;
      was_created := FALSE;
      RETURN NEXT;
    ELSE
      -- Insert new property
      INSERT INTO properties (address, city, state, zip, county, scope, jurisdiction_id)
      VALUES (
        prop->>'address',
        prop->>'city', 
        prop->>'state',
        prop->>'zip',
        prop->>'county',
        prop->>'scope',
        (prop->>'jurisdiction_id')::UUID
      )
      ON CONFLICT ON CONSTRAINT idx_properties_unique_address DO NOTHING
      RETURNING id INTO inserted_id;
      
      IF inserted_id IS NOT NULL THEN
        address := prop->>'address';
        city := prop->>'city';
        state := prop->>'state';
        zip := prop->>'zip';
        property_id := inserted_id;
        was_created := TRUE;
        RETURN NEXT;
      ELSE
        -- Race condition - another process inserted it, fetch it
        SELECT id INTO existing_id
        FROM properties p
        WHERE LOWER(TRIM(p.address)) = LOWER(TRIM(prop->>'address'))
          AND LOWER(TRIM(p.city)) = LOWER(TRIM(prop->>'city'))
          AND LOWER(TRIM(p.state)) = LOWER(TRIM(prop->>'state'));
        
        address := prop->>'address';
        city := prop->>'city';
        state := prop->>'state';
        zip := prop->>'zip';
        property_id := existing_id;
        was_created := FALSE;
        RETURN NEXT;
      END IF;
    END IF;
  END LOOP;
END;
$$;