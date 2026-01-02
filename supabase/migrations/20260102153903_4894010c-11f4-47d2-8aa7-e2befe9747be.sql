
-- Final cleanup - more specific exclusions
DROP MATERIALIZED VIEW IF EXISTS mv_distinct_cities;

CREATE MATERIALIZED VIEW mv_distinct_cities AS
SELECT DISTINCT city, state
FROM properties
WHERE city IS NOT NULL 
  AND state IS NOT NULL
  AND LENGTH(state) = 2
  AND state ~ '^[A-Z]{2}$'
  AND city ~ '^[A-Z][a-z]+(\s[A-Z][a-z]+)*$'
  AND LENGTH(city) BETWEEN 3 AND 25
  -- Exclude street patterns
  AND city !~* '\y(st|dr|rd|ln|blvd|way|ave|trl|ct|cir|loop|road|place|lane|court|circle|drive|trail|boulevard|avenue|street|hwy|highway|pkwy|parkway|terr|terrace)\y'
  -- Exclude common garbage words
  AND city !~* '^(additional|attic|sealed|from|antonio|anvoerth|aveeast|aveelmont|avelevittown|avemerrick|averoosevelt|aveseaford|aveuniondale|avewantagh|avueniondale)'
  AND city !~* 'sealed|attic|permission|county$'
  -- Exclude malformed "Ave" prefix cities
  AND city !~ '^Ave[a-z]'
ORDER BY state, city;

CREATE INDEX idx_mv_cities_state ON mv_distinct_cities(state);
CREATE INDEX idx_mv_cities_city ON mv_distinct_cities(city);

REFRESH MATERIALIZED VIEW mv_distinct_cities;
