-- Backfill newest_violation_date and oldest_violation_date from violations table
UPDATE properties p
SET 
  newest_violation_date = sub.max_date,
  oldest_violation_date = COALESCE(p.oldest_violation_date, sub.min_date)
FROM (
  SELECT 
    v.property_id,
    MAX(v.opened_date) AS max_date,
    MIN(v.opened_date) AS min_date
  FROM violations v
  WHERE v.property_id IS NOT NULL
    AND v.opened_date IS NOT NULL
  GROUP BY v.property_id
) sub
WHERE p.id = sub.property_id
  AND p.newest_violation_date IS NULL
  AND p.total_violations > 0;