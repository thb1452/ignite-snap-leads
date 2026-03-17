DO $$
DECLARE v_count int := 1; v_batch int := 0;
BEGIN
  WHILE v_count > 0 AND v_batch < 5 LOOP
    WITH batch AS (SELECT id FROM properties WHERE newest_violation_date IS NULL AND total_violations > 0 LIMIT 10000),
    agg AS (SELECT v.property_id, MAX(COALESCE(v.opened_date, v.created_at::date)) AS mx, MIN(COALESCE(v.opened_date, v.created_at::date)) AS mn FROM violations v WHERE v.property_id IN (SELECT id FROM batch) GROUP BY v.property_id),
    upd AS (UPDATE properties p SET newest_violation_date = a.mx, oldest_violation_date = COALESCE(p.oldest_violation_date, a.mn) FROM agg a WHERE p.id = a.property_id RETURNING p.id)
    SELECT COUNT(*) INTO v_count FROM upd;
    v_batch := v_batch + 1;
  END LOOP;
END;
$$;