
-- Step 1: Create temp table with winner/loser mapping
CREATE TEMP TABLE dedup_map AS
WITH ranked AS (
  SELECT id, address, city, state,
    ROW_NUMBER() OVER (
      PARTITION BY address, city, state 
      ORDER BY COALESCE(snap_score,0) DESC, COALESCE(open_violations,0) DESC, created_at ASC
    ) AS rn
  FROM properties
  WHERE (address, city, state) IN (
    SELECT address, city, state FROM properties GROUP BY address, city, state HAVING count(*) > 1
  )
)
SELECT r.id as loser_id, w.id as winner_id
FROM ranked r
JOIN ranked w ON r.address = w.address AND r.city = w.city AND r.state = w.state AND w.rn = 1
WHERE r.rn > 1;

-- Step 2: Delete list_properties that would conflict (winner already in same list)
DELETE FROM list_properties lp
USING dedup_map dm
WHERE lp.property_id = dm.loser_id
  AND EXISTS (
    SELECT 1 FROM list_properties lp2
    WHERE lp2.list_id = lp.list_id AND lp2.property_id = dm.winner_id
  );

-- Step 3: Reassign remaining list_properties from loser to winner
UPDATE list_properties lp
SET property_id = dm.winner_id
FROM dedup_map dm
WHERE lp.property_id = dm.loser_id;

-- Step 4: Delete duplicate properties
DELETE FROM properties
WHERE id IN (SELECT loser_id FROM dedup_map);

-- Step 5: Clean up
DROP TABLE dedup_map;
