-- Extract zip codes embedded in address field where zip column is empty
-- Pattern: 5-digit number at end of address string (common format: "123 main st, city, ST 12345")

UPDATE properties
SET zip = (regexp_match(address, '\b(\d{5})(?:-\d{4})?\s*$'))[1]
WHERE (zip IS NULL OR zip = '')
  AND address ~ '\b\d{5}(?:-\d{4})?\s*$';

-- Log how many were updated
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Extracted zip codes for % properties', updated_count;
END $$;