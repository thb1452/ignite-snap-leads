-- ===================================================================
-- CRITICAL FIX: Materialized view is excluding legitimate cities
-- ===================================================================
-- Issue: mv_distinct_cities validation is too strict
-- Missing: San Antonio (11,771 properties), Tampa (5,003 properties)
-- Root cause: Overly aggressive keyword filtering
-- Solution: Prioritize cities by property count, relax validation

-- Drop the broken materialized view
DROP MATERIALIZED VIEW IF EXISTS mv_distinct_cities CASCADE;

-- Create NEW materialized view with property-count-based validation
-- Logic: If a city has 10+ properties, it's probably legitimate
-- This ensures major markets are NEVER excluded
CREATE MATERIALIZED VIEW mv_distinct_cities AS
SELECT DISTINCT
  initcap(trim(city)) as city,
  upper(trim(state)) as state,
  COUNT(*) as property_count
FROM properties
WHERE city IS NOT NULL
  AND city != ''
  -- Basic sanity checks only (very permissive)
  AND length(trim(city)) >= 2
  AND length(trim(city)) <= 100  -- Increased from 50
  AND city ~ '[A-Za-z]'  -- Must contain at least one letter
GROUP BY initcap(trim(city)), upper(trim(state))
HAVING
  -- Include ANY city with 10+ properties (guaranteed legitimate)
  COUNT(*) >= 10
  OR (
    -- For cities with <10 properties, apply stricter validation
    COUNT(*) < 10
    AND initcap(trim(city)) !~ '^\d+'  -- Not starting with number
    AND initcap(trim(city)) !~ '\d+\s+(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|ct|court|way|pl|place)'  -- Not street address
    AND initcap(trim(city)) !~ '\d{4}-\d{2}-\d{2}'  -- Not date YYYY-MM-DD
    AND initcap(trim(city)) !~ '\d{1,2}/\d{1,2}/\d{2,4}'  -- Not date MM/DD/YYYY
    AND initcap(trim(city)) NOT LIKE '%:%'  -- No colons
    AND initcap(trim(city)) NOT LIKE '%#%'  -- No hash symbols
    AND initcap(trim(city)) ~ '^[A-Za-z\s\-''.&]+$'  -- Only letters, spaces, hyphens, apostrophes, periods, ampersands
  )
ORDER BY property_count DESC, city;

-- Create indexes for fast lookups
CREATE UNIQUE INDEX idx_mv_distinct_cities_city_state ON mv_distinct_cities(city, state);
CREATE INDEX idx_mv_distinct_cities_state ON mv_distinct_cities(state);
CREATE INDEX idx_mv_distinct_cities_count ON mv_distinct_cities(property_count DESC);

-- Grant access
GRANT SELECT ON mv_distinct_cities TO authenticated, anon;

-- Add comment explaining the logic
COMMENT ON MATERIALIZED VIEW mv_distinct_cities IS
'Distinct cities with property counts. Cities with 10+ properties are automatically included (guaranteed legitimate). Cities with <10 properties undergo stricter validation to filter garbage.';

-- Recreate the RPC function (was dropped CASCADE)
CREATE OR REPLACE FUNCTION fn_distinct_cities(p_state text DEFAULT NULL)
RETURNS TABLE(city text)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT city
  FROM mv_distinct_cities
  WHERE (p_state IS NULL OR state = upper(p_state))
  ORDER BY property_count DESC, city  -- Prioritize cities with most properties
  LIMIT 2000;  -- Increased from 1000
$$;

-- Log results
DO $$
DECLARE
  total_cities INTEGER;
  cities_with_10plus INTEGER;
  san_antonio_count INTEGER;
  tampa_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_cities FROM mv_distinct_cities;
  SELECT COUNT(*) INTO cities_with_10plus FROM mv_distinct_cities WHERE property_count >= 10;
  SELECT property_count INTO san_antonio_count FROM mv_distinct_cities WHERE city = 'San Antonio' AND state = 'TX';
  SELECT property_count INTO tampa_count FROM mv_distinct_cities WHERE city = 'Tampa' AND state = 'FL';

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Materialized View Rebuild Complete';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Total cities in view: %', total_cities;
  RAISE NOTICE 'Cities with 10+ properties: %', cities_with_10plus;
  RAISE NOTICE 'San Antonio (TX): % properties', COALESCE(san_antonio_count, 0);
  RAISE NOTICE 'Tampa (FL): % properties', COALESCE(tampa_count, 0);
  RAISE NOTICE '========================================';
END $$;
