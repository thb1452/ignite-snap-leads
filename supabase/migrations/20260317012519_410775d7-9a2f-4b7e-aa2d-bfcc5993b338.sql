-- Batch 1: backfill 10000 properties
DO $$
DECLARE
  v_updated int;
BEGIN
  WITH batch AS (
    SELECT p.id
    FROM properties p
    WHERE p.newest_violation_date IS NULL
      AND p.total_violations > 0
    LIMIT 10000
  ),
  agg AS (
    SELECT 
      v.property_id,
      MAX(COALESCE(v.opened_date, v.created_at::date)) AS max_date,
      MIN(COALESCE(v.opened_date, v.created_at::date)) AS min_date
    FROM violations v
    WHERE v.property_id IN (SELECT id FROM batch)
    GROUP BY v.property_id
  ),
  do_update AS (
    UPDATE properties p
    SET 
      newest_violation_date = a.max_date,
      oldest_violation_date = COALESCE(p.oldest_violation_date, a.min_date)
    FROM agg a
    WHERE p.id = a.property_id
    RETURNING p.id
  )
  SELECT COUNT(*) INTO v_updated FROM do_update;
  
  RAISE NOTICE 'Updated % properties', v_updated;
END;
$$;