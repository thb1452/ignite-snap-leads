
-- Enable pg_trgm extension for fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Census places reference table
CREATE TABLE public.census_places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  state_fips text NOT NULL,
  state_abbr text NOT NULL,
  place_fips text NOT NULL,
  UNIQUE(name, state_abbr)
);

-- Allow authenticated users to read census_places (reference data)
ALTER TABLE public.census_places ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read census_places"
  ON public.census_places FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage census_places"
  ON public.census_places FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- City name fix RPC: accepts array of mappings and updates properties in bulk
CREATE OR REPLACE FUNCTION public.fn_fix_city_names(
  mappings jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mapping jsonb;
  total_updated int := 0;
  row_count int;
BEGIN
  -- Only admins can run this
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  FOR mapping IN SELECT * FROM jsonb_array_elements(mappings)
  LOOP
    UPDATE properties
    SET city = mapping->>'new_city',
        updated_at = now()
    WHERE UPPER(TRIM(city)) = UPPER(TRIM(mapping->>'old_city'))
      AND UPPER(TRIM(state)) = UPPER(TRIM(mapping->>'old_state'));
    
    GET DIAGNOSTICS row_count = ROW_COUNT;
    total_updated := total_updated + row_count;
  END LOOP;

  RETURN jsonb_build_object('updated', total_updated);
END;
$$;
