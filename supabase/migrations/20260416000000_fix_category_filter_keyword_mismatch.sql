
-- Fix fn_properties_by_category to use the same keyword arrays as fn_category_property_counts.
-- The count function was updated in April 2026 with expanded keywords, but the filter function
-- was never updated, causing the category filter to return far fewer results than expected.
-- Also adds missing multi_department and escalated fields to match fn_properties_paged output.

CREATE OR REPLACE FUNCTION public.fn_properties_by_category(
  p_category text,
  p_state text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_snap_min integer DEFAULT NULL,
  p_snap_max integer DEFAULT NULL,
  p_last_seen_days integer DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50,
  p_sort_by text DEFAULT 'recently_updated',
  p_open_violations_only boolean DEFAULT false,
  p_multiple_violations_only boolean DEFAULT false,
  p_repeat_offender_only boolean DEFAULT false,
  p_random_seed text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_keywords text[];
  v_offset int;
  v_items jsonb;
  v_total bigint;
  v_is_water boolean := (p_category = 'water_disconnection');
  v_seed text;
BEGIN
  v_offset := (p_page - 1) * p_page_size;
  v_seed := COALESCE(p_random_seed, COALESCE(auth.uid()::text, 'default'));

  IF NOT v_is_water THEN
    v_keywords := CASE p_category
      WHEN 'exterior'    THEN ARRAY['Exterior','Yard','Weeds','Weeds & Rubbish','Lawn','Fence','Paint','Siding']
      WHEN 'safety'      THEN ARRAY['Safety','Fire','Hazard','Electrical','Gas']
      WHEN 'structural'  THEN ARRAY['Structural','Foundation','Roof','Wall','Building']
      WHEN 'zoning'      THEN ARRAY['Zoning','Permit','Unpermitted','Unpermitted Construction','Land Use']
      WHEN 'vacancy'     THEN ARRAY['Vacancy','Vacant','Abandoned','Boarded']
      WHEN 'utility'     THEN ARRAY['Utility','Water','Sewer','Plumbing','Electric']
      WHEN 'maintenance' THEN ARRAY['Rubbish','Grass','Trash','Debris','Weed','Dumping','Waste','Snow']
      WHEN 'interior'    THEN ARRAY['Interior','Plumbing','HVAC','Furnace']
      WHEN 'other'       THEN ARRAY['Unknown','Other','Complaint']
      ELSE ARRAY[initcap(p_category)]
    END;
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM properties p
  WHERE
    CASE WHEN v_is_water THEN p.enforcement_type = 'water_shutoff'
    ELSE p.violation_types && v_keywords
    END
    AND (p_state IS NULL OR p.state ILIKE p_state)
    AND (p_city IS NULL OR p.city ILIKE p_city)
    AND (p_search IS NULL OR (
      p.address ILIKE '%'||p_search||'%' OR
      p.city    ILIKE '%'||p_search||'%' OR
      p.state   ILIKE '%'||p_search||'%' OR
      p.zip     ILIKE '%'||p_search||'%'
    ))
    AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
    AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
    AND (p_last_seen_days IS NULL OR p.updated_at >= NOW() - (p_last_seen_days || ' days')::interval)
    AND (NOT p_open_violations_only OR COALESCE(p.open_violations, 0) > 0)
    AND (NOT p_multiple_violations_only OR COALESCE(p.total_violations, 0) > 1)
    AND (NOT p_repeat_offender_only OR p.repeat_offender = true);

  SELECT jsonb_agg(row_to_json(t))
  INTO v_items
  FROM (
    SELECT
      p.id, p.address, p.city, p.state, p.zip, p.county,
      p.snap_score, p.snap_insight, p.latitude, p.longitude,
      p.total_violations, p.open_violations, p.repeat_offender,
      p.multi_department, p.escalated,
      p.oldest_violation_date, p.newest_violation_date,
      p.avg_days_open, p.opportunity_class, p.enforcement_type,
      p.violation_types, p.distress_signals,
      p.updated_at, p.created_at
    FROM properties p
    WHERE
      CASE WHEN v_is_water THEN p.enforcement_type = 'water_shutoff'
      ELSE p.violation_types && v_keywords
      END
      AND (p_state IS NULL OR p.state ILIKE p_state)
      AND (p_city IS NULL OR p.city ILIKE p_city)
      AND (p_search IS NULL OR (
        p.address ILIKE '%'||p_search||'%' OR
        p.city    ILIKE '%'||p_search||'%' OR
        p.state   ILIKE '%'||p_search||'%' OR
        p.zip     ILIKE '%'||p_search||'%'
      ))
      AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
      AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
      AND (p_last_seen_days IS NULL OR p.updated_at >= NOW() - (p_last_seen_days || ' days')::interval)
      AND (NOT p_open_violations_only OR COALESCE(p.open_violations, 0) > 0)
      AND (NOT p_multiple_violations_only OR COALESCE(p.total_violations, 0) > 1)
      AND (NOT p_repeat_offender_only OR p.repeat_offender = true)
    ORDER BY
      CASE WHEN p_sort_by = 'recently_updated' OR p_sort_by IS NULL THEN p.newest_violation_date END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'snap_score'       THEN p.snap_score           END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'newest_violation'  THEN p.newest_violation_date END DESC NULLS LAST,
      md5(p.id::text || v_seed),
      p.id
    LIMIT p_page_size
    OFFSET v_offset
  ) t;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total', v_total,
    'page', p_page,
    'page_size', p_page_size
  );
END;
$function$;
