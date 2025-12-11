-- Step 1: Update violations to point to the kept property (first created)
WITH duplicate_groups AS (
  SELECT 
    LOWER(TRIM(address)) as norm_address,
    LOWER(TRIM(city)) as norm_city,
    LOWER(TRIM(state)) as norm_state,
    LOWER(TRIM(zip)) as norm_zip,
    (array_agg(id ORDER BY created_at ASC NULLS LAST, id::text ASC))[1] as keep_id,
    array_agg(id) as all_ids
  FROM properties
  WHERE address IS NOT NULL AND city IS NOT NULL AND state IS NOT NULL AND zip IS NOT NULL
  GROUP BY 
    LOWER(TRIM(address)),
    LOWER(TRIM(city)),
    LOWER(TRIM(state)),
    LOWER(TRIM(zip))
  HAVING COUNT(*) > 1
)
UPDATE violations v
SET property_id = dg.keep_id
FROM duplicate_groups dg
WHERE v.property_id = ANY(dg.all_ids)
AND v.property_id != dg.keep_id;

-- Step 2: Delete duplicate properties (keeping the first created one)
WITH duplicate_groups AS (
  SELECT 
    (array_agg(id ORDER BY created_at ASC NULLS LAST, id::text ASC))[1] as keep_id,
    array_agg(id) as all_ids
  FROM properties
  WHERE address IS NOT NULL AND city IS NOT NULL AND state IS NOT NULL AND zip IS NOT NULL
  GROUP BY 
    LOWER(TRIM(address)),
    LOWER(TRIM(city)),
    LOWER(TRIM(state)),
    LOWER(TRIM(zip))
  HAVING COUNT(*) > 1
),
ids_to_delete AS (
  SELECT unnest(all_ids) as id FROM duplicate_groups
  EXCEPT
  SELECT keep_id FROM duplicate_groups
)
DELETE FROM properties WHERE id IN (SELECT id FROM ids_to_delete);

-- Step 3: Create unique index - SOURCE OF TRUTH for property deduplication
CREATE UNIQUE INDEX idx_properties_unique_address 
ON properties (
  LOWER(TRIM(address)),
  LOWER(TRIM(city)),
  LOWER(TRIM(state)),
  LOWER(TRIM(zip))
)
WHERE address IS NOT NULL 
AND city IS NOT NULL 
AND state IS NOT NULL 
AND zip IS NOT NULL;

-- Add comment explaining this is the source of truth
COMMENT ON INDEX idx_properties_unique_address IS 'SOURCE OF TRUTH for property deduplication. Application code should handle conflicts gracefully.';