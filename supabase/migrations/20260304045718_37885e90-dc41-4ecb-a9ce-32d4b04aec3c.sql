DROP FUNCTION IF EXISTS fn_jurisdiction_intelligence();
DROP FUNCTION IF EXISTS fn_state_response_analytics();
DROP FUNCTION IF EXISTS fn_fulfillment_overview();

-- ============================================================
-- fn_jurisdiction_intelligence (revised)
-- Changes: exponential speed decay, bounded hostility, fee split,
--          0-100 clamping, tactical flags
-- ============================================================
CREATE FUNCTION fn_jurisdiction_intelligence()
RETURNS TABLE(
  target_id uuid, jurisdiction_name text, state text, county text,
  population integer, target_type text, portal_difficulty_score integer,
  total_requests bigint, fulfilled_count bigint, rejected_count bigint,
  needs_review_count bigint, no_portal_count bigint,
  fulfillment_rate numeric, rejection_rate numeric,
  avg_response_days numeric, avg_data_quality numeric,
  avg_fee_amount numeric, fee_incidence_rate numeric, avg_fee_nonzero numeric,
  redaction_pct numeric, hostility_score numeric, jis numeric,
  speed_tier text, rejection_tier text, fee_risk text, redaction_pattern text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH base AS (
    SELECT
      t.id AS tid,
      t.jurisdiction_name,
      t.state,
      t.county,
      t.population,
      t.target_type,
      t.portal_difficulty_score,
      COUNT(r.id) AS total_req,
      COUNT(r.id) FILTER (WHERE r.status='fulfilled') AS fulfilled_ct,
      COUNT(r.id) FILTER (WHERE r.status='rejected') AS rejected_ct,
      COUNT(r.id) FILTER (WHERE r.status='needs_review') AS review_ct,
      COUNT(r.id) FILTER (WHERE r.status='no_portal') AS noportal_ct,
      -- avg response days (fulfilled only)
      AVG(CASE WHEN r.status='fulfilled' AND r.sent_at IS NOT NULL AND r.response_received_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (r.response_received_at - r.sent_at)) / 86400.0 END) AS raw_avg_days,
      AVG(r.data_quality_score) AS raw_avg_quality,
      AVG(r.fee_amount) AS raw_avg_fee,
      -- fee incidence: % of requests where fee > 0
      CASE WHEN COUNT(r.id) > 0 THEN
        COUNT(r.id) FILTER (WHERE r.fee_amount > 0)::numeric / COUNT(r.id) * 100
      ELSE 0 END AS raw_fee_incidence,
      -- avg fee among nonzero only
      AVG(r.fee_amount) FILTER (WHERE r.fee_amount > 0) AS raw_avg_fee_nz,
      -- redaction pct among fulfilled
      CASE WHEN COUNT(r.id) FILTER (WHERE r.status='fulfilled') > 0 THEN
        COUNT(r.id) FILTER (WHERE r.redaction_flag = true)::numeric
        / COUNT(r.id) FILTER (WHERE r.status='fulfilled') * 100
      ELSE 0 END AS raw_redaction_pct
    FROM targets t
    LEFT JOIN foia_requests r ON r.target_id = t.id
    WHERE NOT t.is_duplicate
    GROUP BY t.id, t.jurisdiction_name, t.state, t.county, t.population, t.target_type, t.portal_difficulty_score
  ),
  scored AS (
    SELECT *,
      -- derived rates (bounded 0-100)
      CASE WHEN total_req > 0 THEN LEAST(100, ROUND(fulfilled_ct::numeric / total_req * 100, 1)) ELSE 0 END AS fulfill_rate,
      CASE WHEN total_req > 0 THEN LEAST(100, ROUND(rejected_ct::numeric / total_req * 100, 1)) ELSE 0 END AS reject_rate,
      COALESCE(ROUND(raw_avg_days::numeric, 1), 0) AS resp_days,
      COALESCE(ROUND(raw_avg_quality::numeric, 1), 0) AS quality,
      COALESCE(ROUND(raw_avg_fee::numeric, 2), 0) AS fee_avg,
      ROUND(LEAST(100, raw_fee_incidence)::numeric, 1) AS fee_inc,
      COALESCE(ROUND(raw_avg_fee_nz::numeric, 2), 0) AS fee_nz,
      ROUND(LEAST(100, raw_redaction_pct)::numeric, 1) AS redact_pct,
      -- hostility: weighted sum of negative-outcome percentages, clamped
      CASE WHEN total_req > 0 THEN
        LEAST(100, GREATEST(0, ROUND((
          (rejected_ct::numeric / total_req * 100) * 0.50 +
          (review_ct::numeric   / total_req * 100) * 0.30 +
          (noportal_ct::numeric / total_req * 100) * 0.20
        )::numeric, 1)))
      ELSE 0 END AS hostility,
      -- JIS: 5-component weighted score with exponential speed decay
      CASE WHEN total_req > 0 THEN
        LEAST(100, GREATEST(0, ROUND((
          -- 35% fulfillment rate (already 0-100 scale)
          (LEAST(100, fulfilled_ct::numeric / total_req * 100)) * 0.35
          -- 25% speed: exponential decay  100·e^(-days/30)
          + (100.0 * EXP(-1.0 * COALESCE(raw_avg_days, 90) / 30.0)) * 0.25
          -- 20% non-rejection rate
          + (100.0 - LEAST(100, rejected_ct::numeric / total_req * 100)) * 0.20
          -- 10% data quality (1-5 → 0-100)
          + (COALESCE(raw_avg_quality, 3) * 20.0) * 0.10
          -- 10% portal ease (invert difficulty 1-5 → 100-0)
          + ((6.0 - COALESCE(portal_difficulty_score, 3)) * 20.0) * 0.10
        )::numeric, 1)))
      ELSE 0 END AS jis_score
    FROM base
  )
  SELECT
    tid AS target_id,
    jurisdiction_name, state, county, population, target_type, portal_difficulty_score,
    total_req   AS total_requests,
    fulfilled_ct AS fulfilled_count,
    rejected_ct  AS rejected_count,
    review_ct    AS needs_review_count,
    noportal_ct  AS no_portal_count,
    fulfill_rate AS fulfillment_rate,
    reject_rate  AS rejection_rate,
    resp_days    AS avg_response_days,
    quality      AS avg_data_quality,
    fee_avg      AS avg_fee_amount,
    fee_inc      AS fee_incidence_rate,
    fee_nz       AS avg_fee_nonzero,
    redact_pct   AS redaction_pct,
    hostility    AS hostility_score,
    jis_score    AS jis,
    -- tactical flags
    CASE
      WHEN resp_days <= 0 AND fulfilled_ct = 0 THEN 'DEAD'
      WHEN resp_days > 0 AND resp_days < 15 THEN 'FAST'
      WHEN resp_days >= 15 AND resp_days <= 45 THEN 'MEDIUM'
      WHEN resp_days > 45 AND resp_days <= 90 THEN 'SLOW'
      ELSE 'DEAD'
    END AS speed_tier,
    CASE
      WHEN reject_rate < 10 THEN 'LOW'
      WHEN reject_rate <= 30 THEN 'MODERATE'
      ELSE 'HIGH'
    END AS rejection_tier,
    CASE
      WHEN fee_inc <= 0 THEN 'NONE'
      WHEN fee_inc < 20 THEN 'OCCASIONAL'
      ELSE 'FREQUENT'
    END AS fee_risk,
    CASE
      WHEN redact_pct < 10 THEN 'CLEAN'
      WHEN redact_pct <= 40 THEN 'PARTIAL'
      ELSE 'HEAVY'
    END AS redaction_pattern
  FROM scored
$$;

-- ============================================================
-- fn_state_response_analytics (revised)
-- Changes: LEFT JOIN, fee split, tactical defaults for zero-request states
-- ============================================================
CREATE FUNCTION fn_state_response_analytics()
RETURNS TABLE(
  state text, total_requests bigint, fulfilled_count bigint,
  avg_response_days numeric, fulfillment_rate numeric, rejection_rate numeric,
  avg_data_quality numeric, avg_fee_amount numeric,
  fee_incidence_rate numeric, avg_fee_nonzero numeric,
  redaction_pct numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    t.state,
    COUNT(r.id) AS total_requests,
    COUNT(r.id) FILTER (WHERE r.status='fulfilled') AS fulfilled_count,
    COALESCE(ROUND(AVG(
      CASE WHEN r.status='fulfilled' AND r.sent_at IS NOT NULL AND r.response_received_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (r.response_received_at - r.sent_at)) / 86400.0
      END
    )::numeric, 1), 0) AS avg_response_days,
    CASE WHEN COUNT(r.id) > 0 THEN
      LEAST(100, ROUND(COUNT(r.id) FILTER (WHERE r.status='fulfilled')::numeric / COUNT(r.id) * 100, 1))
    ELSE 0 END AS fulfillment_rate,
    CASE WHEN COUNT(r.id) > 0 THEN
      LEAST(100, ROUND(COUNT(r.id) FILTER (WHERE r.status='rejected')::numeric / COUNT(r.id) * 100, 1))
    ELSE 0 END AS rejection_rate,
    COALESCE(ROUND(AVG(r.data_quality_score)::numeric, 1), 0) AS avg_data_quality,
    COALESCE(ROUND(AVG(r.fee_amount)::numeric, 2), 0) AS avg_fee_amount,
    CASE WHEN COUNT(r.id) > 0 THEN
      LEAST(100, ROUND(COUNT(r.id) FILTER (WHERE r.fee_amount > 0)::numeric / COUNT(r.id) * 100, 1))
    ELSE 0 END AS fee_incidence_rate,
    COALESCE(ROUND(AVG(r.fee_amount) FILTER (WHERE r.fee_amount > 0)::numeric, 2), 0) AS avg_fee_nonzero,
    CASE WHEN COUNT(r.id) FILTER (WHERE r.status='fulfilled') > 0 THEN
      LEAST(100, ROUND(COUNT(r.id) FILTER (WHERE r.redaction_flag = true)::numeric
        / COUNT(r.id) FILTER (WHERE r.status='fulfilled') * 100, 1))
    ELSE 0 END AS redaction_pct
  FROM targets t
  LEFT JOIN foia_requests r ON r.target_id = t.id
  WHERE NOT t.is_duplicate
  GROUP BY t.state
  ORDER BY COUNT(r.id) DESC
$$;

-- ============================================================
-- fn_fulfillment_overview (revised)
-- Changes: fee_incidence_rate added, avg_fee renamed avg_fee_nonzero
-- ============================================================
CREATE FUNCTION fn_fulfillment_overview()
RETURNS TABLE(
  total_fulfilled bigint, with_file bigint, file_upload_rate numeric,
  avg_quality numeric, format_csv bigint, format_pdf bigint,
  format_image bigint, format_mixed bigint, format_other bigint,
  avg_response_days numeric,
  fee_incidence_rate numeric, avg_fee_nonzero numeric, total_fees numeric,
  redacted_count bigint, avg_estimated_rows numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COUNT(*) FILTER (WHERE status='fulfilled') AS total_fulfilled,
    COUNT(*) FILTER (WHERE status='fulfilled' AND fulfillment_file_url IS NOT NULL) AS with_file,
    CASE WHEN COUNT(*) FILTER (WHERE status='fulfilled') > 0 THEN
      ROUND(COUNT(*) FILTER (WHERE status='fulfilled' AND fulfillment_file_url IS NOT NULL)::numeric
        / COUNT(*) FILTER (WHERE status='fulfilled') * 100, 1)
    ELSE 0 END AS file_upload_rate,
    COALESCE(ROUND(AVG(data_quality_score) FILTER (WHERE status='fulfilled')::numeric, 1), 0) AS avg_quality,
    COUNT(*) FILTER (WHERE status='fulfilled' AND data_format='csv') AS format_csv,
    COUNT(*) FILTER (WHERE status='fulfilled' AND data_format='pdf') AS format_pdf,
    COUNT(*) FILTER (WHERE status='fulfilled' AND data_format='image') AS format_image,
    COUNT(*) FILTER (WHERE status='fulfilled' AND data_format='mixed') AS format_mixed,
    COUNT(*) FILTER (WHERE status='fulfilled' AND data_format NOT IN ('csv','pdf','image','mixed')) AS format_other,
    COALESCE(ROUND(AVG(
      CASE WHEN status='fulfilled' AND sent_at IS NOT NULL AND response_received_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (response_received_at - sent_at)) / 86400.0
      END
    )::numeric, 1), 0) AS avg_response_days,
    -- fee incidence: % of ALL requests (not just fulfilled) that had a fee
    CASE WHEN COUNT(*) > 0 THEN
      ROUND(COUNT(*) FILTER (WHERE fee_amount > 0)::numeric / COUNT(*) * 100, 1)
    ELSE 0 END AS fee_incidence_rate,
    COALESCE(ROUND(AVG(fee_amount) FILTER (WHERE fee_amount > 0)::numeric, 2), 0) AS avg_fee_nonzero,
    COALESCE(SUM(fee_amount) FILTER (WHERE fee_amount > 0), 0) AS total_fees,
    COUNT(*) FILTER (WHERE redaction_flag = true) AS redacted_count,
    COALESCE(ROUND(AVG(estimated_row_count) FILTER (WHERE estimated_row_count > 0)::numeric, 0), 0) AS avg_estimated_rows
  FROM foia_requests
$$;