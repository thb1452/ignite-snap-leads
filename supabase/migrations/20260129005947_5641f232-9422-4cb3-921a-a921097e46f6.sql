-- Extract zip codes embedded anywhere in address field where zip column is empty
-- Pattern: 5-digit number anywhere in address (avoiding false positives from street numbers)
-- Look for pattern: state abbreviation followed by 5-digit zip

UPDATE properties
SET zip = (regexp_match(address, '\b[A-Za-z]{2}\s+(\d{5})\b'))[1]
WHERE (zip IS NULL OR zip = '')
  AND address ~* '\b[A-Za-z]{2}\s+\d{5}\b';