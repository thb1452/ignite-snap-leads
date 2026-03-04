
-- MODULE 1: Fulfillment tracking columns on foia_requests
ALTER TABLE public.foia_requests
  ADD COLUMN IF NOT EXISTS fulfillment_file_url text,
  ADD COLUMN IF NOT EXISTS fulfillment_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS data_quality_score integer,
  ADD COLUMN IF NOT EXISTS data_format text DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS is_snap_usable boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS parsed_status text DEFAULT 'raw';

-- MODULE 5: Portal difficulty score on targets
ALTER TABLE public.targets
  ADD COLUMN IF NOT EXISTS portal_difficulty_score integer;

-- MODULE 3: Jurisdiction Intelligence Score function
CREATE OR REPLACE FUNCTION public.fn_jurisdiction_intelligence()
RETURNS TABLE (
  target_id uuid,
  jurisdiction_name text,
  state text,
  county text,
  population integer,
  target_type text,
  portal_difficulty_score integer,
  total_requests bigint,
  fulfilled_count bigint,
  rejected_count bigint,
  needs_review_count bigint,
  no_portal_count bigint,
  fulfillment_rate numeric,
  rejection_rate numeric,
  avg_response_days numeric,
  avg_data_quality numeric,
  hostility_score numeric,
  jis numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH req_stats AS (
    SELECT
      r.target_id,
      COUNT(*) AS total_requests,
      COUNT(*) FILTER (WHERE r.status = 'fulfilled') AS fulfilled_count,
      COUNT(*) FILTER (WHERE r.status = 'rejected') AS rejected_count,
      COUNT(*) FILTER (WHERE r.status = 'needs_review') AS needs_review_count,
      COUNT(*) FILTER (WHERE r.status = 'no_portal') AS no_portal_count,
      AVG(
        CASE WHEN r.status = 'fulfilled' AND r.sent_at IS NOT NULL AND r.response_received_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (r.response_received_at - r.sent_at)) / 86400.0
          ELSE NULL
        END
      ) AS avg_response_days,
      AVG(r.data_quality_score) FILTER (WHERE r.data_quality_score IS NOT NULL) AS avg_data_quality
    FROM public.foia_requests r
    WHERE r.target_id IS NOT NULL
    GROUP BY r.target_id
  )
  SELECT
    t.id AS target_id,
    t.jurisdiction_name,
    t.state,
    t.county,
    t.population,
    t.target_type,
    t.portal_difficulty_score,
    COALESCE(s.total_requests, 0) AS total_requests,
    COALESCE(s.fulfilled_count, 0) AS fulfilled_count,
    COALESCE(s.rejected_count, 0) AS rejected_count,
    COALESCE(s.needs_review_count, 0) AS needs_review_count,
    COALESCE(s.no_portal_count, 0) AS no_portal_count,
    CASE WHEN COALESCE(s.total_requests, 0) > 0
      THEN ROUND(COALESCE(s.fulfilled_count, 0)::numeric / s.total_requests * 100, 1)
      ELSE 0
    END AS fulfillment_rate,
    CASE WHEN COALESCE(s.total_requests, 0) > 0
      THEN ROUND(COALESCE(s.rejected_count, 0)::numeric / s.total_requests * 100, 1)
      ELSE 0
    END AS rejection_rate,
    ROUND(COALESCE(s.avg_response_days, 0)::numeric, 1) AS avg_response_days,
    ROUND(COALESCE(s.avg_data_quality, 0)::numeric, 1) AS avg_data_quality,
    -- Hostility score: weighted sum of rejection + needs_review + no_portal rates
    CASE WHEN COALESCE(s.total_requests, 0) > 0
      THEN ROUND(
        (COALESCE(s.rejected_count, 0) * 3 + COALESCE(s.needs_review_count, 0) * 2 + COALESCE(s.no_portal_count, 0) * 2)::numeric
        / s.total_requests * 100 / 3, 1
      )
      ELSE 0
    END AS hostility_score,
    -- JIS: composite score (higher = better jurisdiction)
    -- fulfillment_rate * 0.35 + response_speed * 0.25 + (100 - rejection_rate) * 0.2 + quality * 0.1 + (6 - difficulty) * 0.1
    CASE WHEN COALESCE(s.total_requests, 0) > 0
      THEN ROUND(
        (COALESCE(s.fulfilled_count, 0)::numeric / s.total_requests * 100) * 0.35
        + GREATEST(0, 100 - COALESCE(s.avg_response_days, 90)::numeric) * 0.25
        + (100 - COALESCE(s.rejected_count, 0)::numeric / s.total_requests * 100) * 0.20
        + COALESCE(s.avg_data_quality, 3)::numeric * 20 * 0.10
        + (6 - COALESCE(t.portal_difficulty_score, 3))::numeric * 20 * 0.10
      , 1)
      ELSE 0
    END AS jis
  FROM public.targets t
  LEFT JOIN req_stats s ON s.target_id = t.id
  WHERE t.is_duplicate = false
  ORDER BY jis DESC;
$$;

-- State-level response analytics function
CREATE OR REPLACE FUNCTION public.fn_state_response_analytics()
RETURNS TABLE (
  state text,
  total_requests bigint,
  fulfilled_count bigint,
  avg_response_days numeric,
  fulfillment_rate numeric,
  rejection_rate numeric,
  avg_data_quality numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.state,
    COUNT(*) AS total_requests,
    COUNT(*) FILTER (WHERE r.status = 'fulfilled') AS fulfilled_count,
    ROUND(AVG(
      CASE WHEN r.status = 'fulfilled' AND r.sent_at IS NOT NULL AND r.response_received_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (r.response_received_at - r.sent_at)) / 86400.0
        ELSE NULL
      END
    )::numeric, 1) AS avg_response_days,
    ROUND(COUNT(*) FILTER (WHERE r.status = 'fulfilled')::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS fulfillment_rate,
    ROUND(COUNT(*) FILTER (WHERE r.status = 'rejected')::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS rejection_rate,
    ROUND(AVG(r.data_quality_score) FILTER (WHERE r.data_quality_score IS NOT NULL)::numeric, 1) AS avg_data_quality
  FROM public.foia_requests r
  JOIN public.targets t ON t.id = r.target_id
  WHERE r.target_id IS NOT NULL
  GROUP BY t.state
  ORDER BY total_requests DESC;
$$;

-- Fulfillment overview stats function
CREATE OR REPLACE FUNCTION public.fn_fulfillment_overview()
RETURNS TABLE (
  total_fulfilled bigint,
  with_file bigint,
  file_upload_rate numeric,
  avg_quality numeric,
  format_csv bigint,
  format_pdf bigint,
  format_image bigint,
  format_mixed bigint,
  format_other bigint,
  avg_response_days numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*) FILTER (WHERE status = 'fulfilled') AS total_fulfilled,
    COUNT(*) FILTER (WHERE status = 'fulfilled' AND fulfillment_file_url IS NOT NULL) AS with_file,
    ROUND(
      COUNT(*) FILTER (WHERE status = 'fulfilled' AND fulfillment_file_url IS NOT NULL)::numeric
      / NULLIF(COUNT(*) FILTER (WHERE status = 'fulfilled'), 0) * 100, 1
    ) AS file_upload_rate,
    ROUND(AVG(data_quality_score) FILTER (WHERE data_quality_score IS NOT NULL)::numeric, 1) AS avg_quality,
    COUNT(*) FILTER (WHERE data_format = 'csv') AS format_csv,
    COUNT(*) FILTER (WHERE data_format = 'pdf') AS format_pdf,
    COUNT(*) FILTER (WHERE data_format = 'image') AS format_image,
    COUNT(*) FILTER (WHERE data_format = 'mixed') AS format_mixed,
    COUNT(*) FILTER (WHERE data_format = 'other') AS format_other,
    ROUND(AVG(
      CASE WHEN status = 'fulfilled' AND sent_at IS NOT NULL AND response_received_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (response_received_at - sent_at)) / 86400.0
        ELSE NULL
      END
    )::numeric, 1) AS avg_response_days
  FROM public.foia_requests
  WHERE target_id IS NOT NULL;
$$;
