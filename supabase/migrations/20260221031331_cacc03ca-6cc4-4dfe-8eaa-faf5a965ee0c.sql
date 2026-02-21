
CREATE OR REPLACE FUNCTION fn_backfill_zips_nearest_neighbor(
  p_city TEXT DEFAULT NULL,
  p_state TEXT DEFAULT NULL,
  p_batch_size INT DEFAULT 500
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT := 0;
  v_skipped INT := 0;
  v_conflicts INT := 0;
  v_no_coords INT := 0;
  v_total INT := 0;
  rec RECORD;
  v_nearest_zip TEXT;
  v_exists BOOLEAN;
BEGIN
  FOR rec IN
    SELECT id, address, city, state, latitude, longitude
    FROM properties
    WHERE (zip IS NULL OR zip = '')
      AND (p_city IS NULL OR UPPER(city) = UPPER(p_city))
      AND (p_state IS NULL OR UPPER(state) = UPPER(p_state))
      AND latitude IS NOT NULL AND longitude IS NOT NULL
      AND latitude != 0 AND longitude != 0
    LIMIT p_batch_size
  LOOP
    v_total := v_total + 1;
    
    SELECT p2.zip INTO v_nearest_zip
    FROM properties p2
    WHERE p2.zip IS NOT NULL AND p2.zip != ''
      AND p2.latitude IS NOT NULL AND p2.longitude IS NOT NULL
      AND p2.latitude != 0 AND p2.longitude != 0
      AND ABS(p2.latitude - rec.latitude) < 0.5
      AND ABS(p2.longitude - rec.longitude) < 0.5
    ORDER BY 
      (p2.latitude - rec.latitude)^2 + (p2.longitude - rec.longitude)^2
    LIMIT 1;
    
    IF v_nearest_zip IS NOT NULL THEN
      -- Check if updating would create a duplicate
      SELECT EXISTS(
        SELECT 1 FROM properties
        WHERE id != rec.id
          AND lower(trim(address)) = lower(trim(rec.address))
          AND lower(trim(city)) = lower(trim(rec.city))
          AND lower(trim(state)) = lower(trim(rec.state))
          AND lower(trim(zip)) = lower(trim(v_nearest_zip))
      ) INTO v_exists;
      
      IF v_exists THEN
        v_conflicts := v_conflicts + 1;
      ELSE
        UPDATE properties SET zip = v_nearest_zip WHERE id = rec.id;
        v_updated := v_updated + 1;
      END IF;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;
  
  SELECT COUNT(*) INTO v_no_coords
  FROM properties
  WHERE (zip IS NULL OR zip = '')
    AND (p_city IS NULL OR UPPER(city) = UPPER(p_city))
    AND (p_state IS NULL OR UPPER(state) = UPPER(p_state))
    AND (latitude IS NULL OR longitude IS NULL OR latitude = 0 OR longitude = 0);
  
  RETURN json_build_object(
    'updated', v_updated,
    'skipped_no_match', v_skipped,
    'conflicts_skipped', v_conflicts,
    'no_coords', v_no_coords,
    'batch_processed', v_total
  );
END;
$$;
