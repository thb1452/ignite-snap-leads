
-- Optimized Baltimore-style backfill: uses city-local zip centroids only
CREATE OR REPLACE FUNCTION fn_backfill_zips_by_city_centroids(
  p_city TEXT,
  p_state TEXT,
  p_batch_size INT DEFAULT 500
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT := 0;
  v_remaining INT := 0;
  v_no_coords INT := 0;
BEGIN
  -- Build centroids ONLY from same city's existing ZIP data
  WITH city_zip_centroids AS (
    SELECT zip,
      AVG(latitude::float) as clat,
      AVG(longitude::float) as clng
    FROM properties
    WHERE zip IS NOT NULL AND zip != ''
      AND UPPER(city) = UPPER(p_city)
      AND UPPER(state) = UPPER(p_state)
      AND latitude IS NOT NULL AND longitude IS NOT NULL
      AND latitude != 0 AND longitude != 0
    GROUP BY zip
  ),
  candidates AS (
    SELECT id, address, city, state, latitude::float as lat, longitude::float as lng
    FROM properties
    WHERE (zip IS NULL OR zip = '')
      AND UPPER(city) = UPPER(p_city)
      AND UPPER(state) = UPPER(p_state)
      AND latitude IS NOT NULL AND longitude IS NOT NULL
      AND latitude != 0 AND longitude != 0
    LIMIT p_batch_size
  ),
  nearest AS (
    SELECT DISTINCT ON (c.id)
      c.id, c.address, c.city, c.state, zc.zip as derived_zip
    FROM candidates c
    CROSS JOIN city_zip_centroids zc
    ORDER BY c.id, (c.lat - zc.clat)^2 + (c.lng - zc.clng)^2
  ),
  safe_updates AS (
    SELECT n.id, n.derived_zip
    FROM nearest n
    WHERE NOT EXISTS (
      SELECT 1 FROM properties p2
      WHERE p2.id != n.id
        AND lower(trim(p2.address)) = lower(trim(n.address))
        AND lower(trim(p2.city)) = lower(trim(n.city))
        AND lower(trim(p2.state)) = lower(trim(n.state))
        AND lower(trim(p2.zip)) = lower(trim(n.derived_zip))
    )
  ),
  do_update AS (
    UPDATE properties p
    SET zip = su.derived_zip
    FROM safe_updates su
    WHERE p.id = su.id
    RETURNING p.id
  )
  SELECT COUNT(*) INTO v_updated FROM do_update;

  SELECT COUNT(*) INTO v_remaining
  FROM properties
  WHERE (zip IS NULL OR zip = '')
    AND UPPER(city) = UPPER(p_city) AND UPPER(state) = UPPER(p_state)
    AND latitude IS NOT NULL AND longitude IS NOT NULL
    AND latitude != 0 AND longitude != 0;

  SELECT COUNT(*) INTO v_no_coords
  FROM properties
  WHERE (zip IS NULL OR zip = '')
    AND UPPER(city) = UPPER(p_city) AND UPPER(state) = UPPER(p_state)
    AND (latitude IS NULL OR longitude IS NULL OR latitude = 0 OR longitude = 0);

  RETURN json_build_object(
    'updated', v_updated,
    'remaining_with_coords', v_remaining,
    'no_coords', v_no_coords
  );
END;
$$;

GRANT EXECUTE ON FUNCTION fn_backfill_zips_by_city_centroids TO authenticated;
