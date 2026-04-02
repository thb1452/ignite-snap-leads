-- Batched property fetch for CSV export (POST body uuid[] avoids PostgREST URL limits on large .in() lists)

CREATE OR REPLACE FUNCTION public.fn_export_properties_batch(
  p_property_ids uuid[],
  p_enforce_code_violation_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'address', q.address,
        'city', q.city,
        'state', q.state,
        'zip', q.zip,
        'snap_insight', q.snap_insight,
        'snap_score', q.snap_score,
        'enforcement_type', q.enforcement_type,
        'violations', q.violations
      )
      ORDER BY q.snap_score DESC NULLS LAST
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT
      p.address,
      p.city,
      p.state,
      p.zip,
      p.snap_insight,
      p.snap_score,
      p.enforcement_type,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'violation_type', v.violation_type,
              'status', v.status,
              'opened_date', v.opened_date
            )
            ORDER BY v.opened_date
          )
          FROM violations v
          WHERE v.property_id = p.id
        ),
        '[]'::jsonb
      ) AS violations
    FROM properties p
    WHERE p.id = ANY (p_property_ids)
      AND (NOT p_enforce_code_violation_only OR p.enforcement_type = 'code_violation')
  ) q;
$$;

GRANT EXECUTE ON FUNCTION public.fn_export_properties_batch(uuid[], boolean) TO authenticated;
