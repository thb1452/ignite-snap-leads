
-- PostGIS nearest-neighbor ZIP derivation function
-- Finds the closest property WITH a known ZIP for each property missing one
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
  v_no_coords INT := 0;
  v_total INT := 0;
  rec RECORD;
  v_nearest_zip TEXT;
BEGIN
  FOR rec IN
    SELECT id, latitude, longitude
    FROM properties
    WHERE (zip IS NULL OR zip = '')
      AND (p_city IS NULL OR UPPER(city) = UPPER(p_city))
      AND (p_state IS NULL OR UPPER(state) = UPPER(p_state))
      AND latitude IS NOT NULL AND longitude IS NOT NULL
      AND latitude != 0 AND longitude != 0
    LIMIT p_batch_size
  LOOP
    v_total := v_total + 1;
    
    -- Find nearest property with a known ZIP using PostGIS distance
    SELECT p2.zip INTO v_nearest_zip
    FROM properties p2
    WHERE p2.zip IS NOT NULL AND p2.zip != ''
      AND p2.latitude IS NOT NULL AND p2.longitude IS NOT NULL
      AND p2.latitude != 0 AND p2.longitude != 0
      -- Limit search radius to ~50km for performance
      AND ABS(p2.latitude - rec.latitude) < 0.5
      AND ABS(p2.longitude - rec.longitude) < 0.5
    ORDER BY 
      (p2.latitude - rec.latitude)^2 + (p2.longitude - rec.longitude)^2
    LIMIT 1;
    
    IF v_nearest_zip IS NOT NULL THEN
      UPDATE properties SET zip = v_nearest_zip WHERE id = rec.id;
      v_updated := v_updated + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;
  
  -- Count remaining without coords
  SELECT COUNT(*) INTO v_no_coords
  FROM properties
  WHERE (zip IS NULL OR zip = '')
    AND (p_city IS NULL OR UPPER(city) = UPPER(p_city))
    AND (p_state IS NULL OR UPPER(state) = UPPER(p_state))
    AND (latitude IS NULL OR longitude IS NULL OR latitude = 0 OR longitude = 0);
  
  RETURN json_build_object(
    'updated', v_updated,
    'skipped_no_match', v_skipped,
    'no_coords', v_no_coords,
    'batch_processed', v_total
  );
END;
$$;

-- Data health monitoring function
CREATE OR REPLACE FUNCTION fn_data_health_report()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'total_properties', (SELECT COUNT(*) FROM properties),
    'missing_zip', (SELECT COUNT(*) FROM properties WHERE zip IS NULL OR zip = ''),
    'missing_zip_pct', ROUND(100.0 * (SELECT COUNT(*) FROM properties WHERE zip IS NULL OR zip = '') / GREATEST((SELECT COUNT(*) FROM properties), 1), 2),
    'missing_latlng', (SELECT COUNT(*) FROM properties WHERE latitude IS NULL OR longitude IS NULL OR latitude = 0 OR longitude = 0),
    'missing_latlng_pct', ROUND(100.0 * (SELECT COUNT(*) FROM properties WHERE latitude IS NULL OR longitude IS NULL OR latitude = 0 OR longitude = 0) / GREATEST((SELECT COUNT(*) FROM properties), 1), 2),
    'missing_snap_score', (SELECT COUNT(*) FROM properties WHERE snap_score IS NULL),
    'total_violations', (SELECT COUNT(*) FROM violations),
    'top_missing_zip_cities', (
      SELECT json_agg(row_to_json(t))
      FROM (
        SELECT city, state,
          COUNT(*) FILTER (WHERE zip IS NULL OR zip = '') as missing,
          COUNT(*) as total,
          ROUND(100.0 * COUNT(*) FILTER (WHERE zip IS NULL OR zip = '') / COUNT(*), 1) as pct_missing,
          MAX(updated_at) as last_update
        FROM properties
        GROUP BY city, state
        HAVING COUNT(*) FILTER (WHERE zip IS NULL OR zip = '') > 0
        ORDER BY COUNT(*) FILTER (WHERE zip IS NULL OR zip = '') DESC
        LIMIT 25
      ) t
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Grant execute to authenticated users (admin-only in practice via RLS)
GRANT EXECUTE ON FUNCTION fn_backfill_zips_nearest_neighbor TO authenticated;
GRANT EXECUTE ON FUNCTION fn_data_health_report TO authenticated;
