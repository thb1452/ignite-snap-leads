-- ===================================================================
-- Clean garbage city data from properties table
-- ===================================================================
-- This migration identifies and removes garbage data in the city column
-- caused by CSV imports that mapped wrong columns to city field

-- Backup table (optional - for safety)
-- CREATE TABLE IF NOT EXISTS properties_city_backup AS
-- SELECT id, city FROM properties;

-- Pattern 1: City values that look like street addresses (contain numbers + street suffixes)
UPDATE properties
SET city = NULL
WHERE city IS NOT NULL
  AND (
    -- Contains street suffixes with numbers
    city ~* '\d+\s+(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|ct|court|way|pl|place|pkwy|parkway|cir|circle)'
    -- OR starts with number
    OR city ~* '^\d+'
    -- OR contains common address patterns
    OR city ~* '\d+\s+[a-z]+\s+(st|ave|rd|dr|ln|ct|way|pl)'
  );

-- Pattern 2: City values that look like violation descriptions
UPDATE properties
SET city = NULL
WHERE city IS NOT NULL
  AND (
    city ILIKE '%violation%' OR
    city ILIKE '%debris%' OR
    city ILIKE '%trash%' OR
    city ILIKE '%weeds%' OR
    city ILIKE '%overgrown%' OR
    city ILIKE '%illegal%' OR
    city ILIKE '%unpermitted%' OR
    city ILIKE '%code%' OR
    city ILIKE '%notice%' OR
    city ILIKE '%complaint%' OR
    city ILIKE '%hazard%' OR
    city ILIKE '%unsafe%' OR
    city ILIKE '%repair%' OR
    city ILIKE '%maintain%' OR
    city ILIKE '%fence%' OR
    city ILIKE '%yard%' OR
    city ILIKE '%property%' OR
    city ILIKE '%building%' OR
    city ILIKE '%structure%' OR
    city ILIKE '%obstruct%' OR
    city ILIKE '%parked%' OR
    city ILIKE '%stored%' OR
    city ILIKE '%dumped%' OR
    city ILIKE '%vehicle%' OR
    city ILIKE '%junk%' OR
    city ILIKE '%abandoned%' OR
    city ILIKE '%grass%' OR
    city ILIKE '%permit%' OR
    city ILIKE '%inspection%' OR
    city ILIKE '%citation%'
  );

-- Pattern 3: City values with special characters (field headers, notes)
UPDATE properties
SET city = NULL
WHERE city IS NOT NULL
  AND (
    city LIKE '%:%' OR
    city LIKE '%;%' OR
    city LIKE '%(%' OR
    city LIKE '%)%' OR
    city LIKE '%[%' OR
    city LIKE '%]%' OR
    city LIKE '%#%' OR
    city LIKE '%@%' OR
    city LIKE '%*%' OR
    city LIKE '%&%'
  );

-- Pattern 4: City values that are too long or too short
UPDATE properties
SET city = NULL
WHERE city IS NOT NULL
  AND (
    LENGTH(city) > 50 OR
    LENGTH(city) < 2
  );

-- Pattern 5: City values that contain multiple sentences (notes/descriptions)
UPDATE properties
SET city = NULL
WHERE city IS NOT NULL
  AND city ~ '\.\s+[A-Z]';  -- Period followed by space and capital letter

-- Pattern 6: City values that are clearly field headers
UPDATE properties
SET city = NULL
WHERE city IS NOT NULL
  AND (
    city ILIKE 'property address' OR
    city ILIKE 'case number' OR
    city ILIKE 'file%number%' OR
    city ILIKE 'violation%type%' OR
    city ILIKE 'description' OR
    city ILIKE 'location' OR
    city ILIKE 'address' OR
    city ILIKE 'city' OR  -- The word "City" itself from header
    city ILIKE 'status' OR
    city ILIKE 'date%opened%' OR
    city ILIKE 'date%closed%'
  );

-- Pattern 7: City values that contain dates or zip codes
UPDATE properties
SET city = NULL
WHERE city IS NOT NULL
  AND (
    -- Contains date patterns (MM/DD/YYYY, YYYY-MM-DD)
    city ~ '\d{1,2}/\d{1,2}/\d{2,4}' OR
    city ~ '\d{4}-\d{2}-\d{2}' OR
    -- Contains zip codes (5 or 9 digits)
    city ~ '^\d{5}(-\d{4})?$'
  );

-- Pattern 8: City values that are just numbers or symbols
UPDATE properties
SET city = NULL
WHERE city IS NOT NULL
  AND (
    city ~ '^\d+$' OR  -- All numbers
    city ~ '^[^a-zA-Z]+$' OR  -- No letters at all
    city ~ '^[A-Z]?\d+$'  -- Single letter followed by numbers (like "A123")
  );

-- Pattern 9: City values containing words that indicate they're not cities
UPDATE properties
SET city = NULL
WHERE city IS NOT NULL
  AND (
    city ILIKE '%please%' OR
    city ILIKE '%must%' OR
    city ILIKE '%should%' OR
    city ILIKE '%shall%' OR
    city ILIKE '%required%' OR
    city ILIKE '%notify%' OR
    city ILIKE '%backyard%' OR
    city ILIKE '%front yard%' OR
    city ILIKE '%side%yard%' OR
    city ILIKE '%rear%' OR
    city ILIKE '%porch%' OR
    city ILIKE '%roof%' OR
    city ILIKE '%window%' OR
    city ILIKE '%hurricane%' OR
    city ILIKE '%storm%' OR
    city ILIKE '%flood%' OR
    city ILIKE '%damage%' OR
    city ILIKE '%broken%' OR
    city ILIKE '%missing%'
  );

-- Log the cleanup results
DO $$
DECLARE
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count FROM properties WHERE city IS NULL;
  RAISE NOTICE 'Cleanup complete. Properties with NULL city: %', null_count;
END $$;

-- Add a comment for documentation
COMMENT ON COLUMN properties.city IS 'City name - cleaned of garbage data from CSV imports (street addresses, violation descriptions, field headers removed)';
