
-- Recreate cities view with much stricter filtering
DROP MATERIALIZED VIEW IF EXISTS mv_distinct_cities;

CREATE MATERIALIZED VIEW mv_distinct_cities AS
SELECT DISTINCT city, state
FROM properties
WHERE city IS NOT NULL 
  AND state IS NOT NULL
  AND LENGTH(state) = 2
  AND state ~ '^[A-Z]{2}$'
  -- Very strict city filtering:
  AND city ~ '^[A-Z][a-z]+(\s[A-Z][a-z]+)*$'  -- Proper Title Case words only (e.g. "San Francisco", "New York")
  AND LENGTH(city) BETWEEN 2 AND 25
  AND city !~ '(Apt|Unit|Suite|Ste|Bldg|Floor|Lot|Room|Sealed|Attic|State|Additional|Antonio)'  -- No address/building terms
ORDER BY state, city;

-- Recreate indexes
CREATE INDEX idx_mv_cities_state ON mv_distinct_cities(state);
CREATE INDEX idx_mv_cities_city ON mv_distinct_cities(city);

REFRESH MATERIALIZED VIEW mv_distinct_cities;
