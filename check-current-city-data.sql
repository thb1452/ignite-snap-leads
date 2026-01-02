-- Run this to see what's currently in your city dropdown
-- This shows you the garbage BEFORE running the migrations

-- Sample of distinct cities (first 50)
SELECT DISTINCT city
FROM properties
WHERE city IS NOT NULL
ORDER BY city
LIMIT 50;

-- Count of cities that look like street addresses
SELECT COUNT(DISTINCT city) as street_address_count
FROM properties
WHERE city IS NOT NULL
  AND city ~ '\d+\s+(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|ct|court|way|pl|place)';

-- Sample of city values that look like street addresses
SELECT DISTINCT city
FROM properties
WHERE city IS NOT NULL
  AND city ~ '\d+\s+(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|ct|court|way|pl|place)'
LIMIT 20;

-- Cities with special characters (likely field headers or notes)
SELECT DISTINCT city
FROM properties
WHERE city IS NOT NULL
  AND (city LIKE '%:%' OR city LIKE '%;%' OR city LIKE '%(%' OR city LIKE '%#%')
LIMIT 20;

-- Cities that look like dates
SELECT DISTINCT city
FROM properties
WHERE city IS NOT NULL
  AND (city ~ '\d{1,2}/\d{1,2}/\d{2,4}' OR city ~ '\d{4}-\d{2}-\d{2}')
LIMIT 20;

-- Cities with violation keywords
SELECT DISTINCT city
FROM properties
WHERE city IS NOT NULL
  AND (city ILIKE '%violation%' OR city ILIKE '%debris%' OR city ILIKE '%trash%' OR city ILIKE '%weeds%')
LIMIT 20;

-- Summary statistics
SELECT
  COUNT(*) as total_properties,
  COUNT(DISTINCT city) as distinct_cities,
  COUNT(*) FILTER (WHERE city IS NULL) as null_cities,
  COUNT(*) FILTER (WHERE city ~ '\d+\s+(st|street|ave|avenue|rd)') as street_addresses,
  COUNT(*) FILTER (WHERE city ~ '\d') as contains_numbers,
  COUNT(*) FILTER (WHERE city LIKE '%:%') as has_colons
FROM properties;
