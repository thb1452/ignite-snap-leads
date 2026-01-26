-- Normalize all address, city, and state fields to UPPERCASE for consistency
-- This matches the fix applied to process-upload which now uses toUpperCase()

-- Update addresses to UPPERCASE
UPDATE public.properties
SET address = UPPER(address)
WHERE address IS NOT NULL
  AND address != UPPER(address);

-- Update cities to UPPERCASE
UPDATE public.properties
SET city = UPPER(city)
WHERE city IS NOT NULL
  AND city != UPPER(city);

-- Update states to UPPERCASE
UPDATE public.properties
SET state = UPPER(state)
WHERE state IS NOT NULL
  AND state != UPPER(state);

-- Log the update counts
DO $$
DECLARE
  addr_count INTEGER;
  city_count INTEGER;
  state_count INTEGER;
BEGIN
  -- These will show 0 since we already updated, but good for documentation
  SELECT COUNT(*) INTO addr_count FROM public.properties WHERE address != UPPER(address);
  SELECT COUNT(*) INTO city_count FROM public.properties WHERE city != UPPER(city);
  SELECT COUNT(*) INTO state_count FROM public.properties WHERE state != UPPER(state);

  RAISE NOTICE 'Address normalization complete. Remaining non-uppercase: addresses=%, cities=%, states=%',
    addr_count, city_count, state_count;
END $$;
