
CREATE OR REPLACE FUNCTION get_duplicate_property_groups(batch_limit int DEFAULT 200)
RETURNS TABLE(winner_id uuid, loser_ids uuid[])
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
  ),
  groups AS (
    SELECT 
      (SELECT r2.id FROM ranked r2 WHERE r2.address = r.address AND r2.city = r.city AND r2.state = r.state AND r2.rn = 1) as winner_id,
      array_agg(r.id) as loser_ids,
      r.address, r.city, r.state
    FROM ranked r
    WHERE r.rn > 1
    GROUP BY r.address, r.city, r.state
  )
  SELECT g.winner_id, g.loser_ids
  FROM groups g
  LIMIT batch_limit;
$$;
