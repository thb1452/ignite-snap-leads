-- Batch 2: next 10000
DO $$
BEGIN
  WITH batch AS (
    SELECT id FROM properties WHERE newest_violation_date IS NULL AND total_violations > 0 LIMIT 10000
  ),
  agg AS (
    SELECT v.property_id, MAX(COALESCE(v.opened_date, v.created_at::date)) AS max_date, MIN(COALESCE(v.opened_date, v.created_at::date)) AS min_date
    FROM violations v WHERE v.property_id IN (SELECT id FROM batch) GROUP BY v.property_id
  )
  UPDATE properties p SET newest_violation_date = a.max_date, oldest_violation_date = COALESCE(p.oldest_violation_date, a.min_date)
  FROM agg a WHERE p.id = a.property_id;
END;
$$;