
-- Create a function to backfill missing ZIPs using the most common ZIP per city/state
CREATE OR REPLACE FUNCTION public.fn_backfill_zips_by_city_mode(p_city TEXT, p_state TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode_zip TEXT;
  v_updated INTEGER;
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

  -- Update all properties in this city missing a ZIP
  UPDATE properties
  SET zip = v_mode_zip
  WHERE LOWER(city) = LOWER(p_city)
    AND LOWER(state) = LOWER(p_state)
    AND (zip IS NULL OR zip = '');

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;
