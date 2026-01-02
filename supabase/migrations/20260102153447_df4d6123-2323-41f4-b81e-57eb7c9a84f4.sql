
-- Recreate cities view with stricter filtering
DROP MATERIALIZED VIEW IF EXISTS mv_distinct_cities;

CREATE MATERIALIZED VIEW mv_distinct_cities AS
SELECT DISTINCT city, state
FROM properties
WHERE city IS NOT NULL 
  AND state IS NOT NULL
  AND LENGTH(state) = 2
  AND state ~ '^[A-Z]{2}$'
  -- Stricter city filtering:
  AND city ~ '^[A-Z][a-zA-Z\s\-]+$'  -- Start with uppercase, only letters/spaces/hyphens
  AND city !~ '\s(St|Dr|Rd|Ln|Blvd|Way|Ave|Trl|Ct|Cir|Loop|Road|Place|Lane|Court|Circle|Drive|Trail|Boulevard|Avenue|Street)(\s|$)'  -- No street suffixes anywhere
  AND city !~ '^(And|The|This|That|My|Your|Their|Its|Was|Were|Has|Have|Had|Is|Are|Be|Been|But|Or|Not|With|Without|For|From|Into|Over|Under|After|Before|During|About|Between|Through|Above|Below)(\s|$)'  -- Doesn't start with common non-city words
  AND LENGTH(city) BETWEEN 2 AND 25
ORDER BY state, city;

-- Recreate indexes
CREATE INDEX idx_mv_cities_state ON mv_distinct_cities(state);
CREATE INDEX idx_mv_cities_city ON mv_distinct_cities(city);

REFRESH MATERIALIZED VIEW mv_distinct_cities;
