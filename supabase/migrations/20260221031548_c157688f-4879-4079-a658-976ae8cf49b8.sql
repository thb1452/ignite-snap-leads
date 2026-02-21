
-- Optimized: Use ZIP centroids instead of per-row nearest-neighbor
-- This is O(N * num_zips) instead of O(N * total_properties)
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
BEGIN
  -- Set-based update using zip centroids and lateral join
  WITH zip_centroids AS (
    -- Pre-compute average lat/lng per ZIP in the search area
    SELECT zip,
      AVG(latitude::float) as clat,
      AVG(longitude::float) as clng
    FROM properties
    WHERE zip IS NOT NULL AND zip != ''
      AND latitude IS NOT NULL AND longitude IS NOT NULL
      AND latitude != 0 AND longitude != 0
      AND (p_state IS NULL OR UPPER(state) = UPPER(p_state))
    GROUP BY zip
  ),
  candidates AS (
    SELECT id, address, city, state, latitude::float as lat, longitude::float as lng
    FROM properties
    WHERE (zip IS NULL OR zip = '')
      AND (p_city IS NULL OR UPPER(city) = UPPER(p_city))
      AND (p_state IS NULL OR UPPER(state) = UPPER(p_state))
      AND latitude IS NOT NULL AND longitude IS NOT NULL
      AND latitude != 0 AND longitude != 0
    LIMIT p_batch_size
  ),
  nearest AS (
    SELECT DISTINCT ON (c.id)
      c.id, c.address, c.city, c.state, zc.zip as derived_zip
    FROM candidates c
    CROSS JOIN zip_centroids zc
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

  -- Count total candidates processed
  SELECT COUNT(*) INTO v_total
  FROM properties
  WHERE (zip IS NULL OR zip = '')
    AND (p_city IS NULL OR UPPER(city) = UPPER(p_city))
    AND (p_state IS NULL OR UPPER(state) = UPPER(p_state))
    AND latitude IS NOT NULL AND longitude IS NOT NULL
    AND latitude != 0 AND longitude != 0;

  SELECT COUNT(*) INTO v_no_coords
  FROM properties
  WHERE (zip IS NULL OR zip = '')
    AND (p_city IS NULL OR UPPER(city) = UPPER(p_city))
    AND (p_state IS NULL OR UPPER(state) = UPPER(p_state))
    AND (latitude IS NULL OR longitude IS NULL OR latitude = 0 OR longitude = 0);

  RETURN json_build_object(
    'updated', v_updated,
    'remaining_with_coords', v_total - v_updated,
    'no_coords', v_no_coords,
    'batch_size', p_batch_size
  );
END;
$$;
