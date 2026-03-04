DROP FUNCTION IF EXISTS fn_jurisdiction_intelligence();
DROP FUNCTION IF EXISTS fn_state_response_analytics();
DROP FUNCTION IF EXISTS fn_fulfillment_overview();

CREATE FUNCTION fn_jurisdiction_intelligence()
RETURNS TABLE(
  target_id uuid, jurisdiction_name text, state text, county text, population integer,
  target_type text, portal_difficulty_score integer, total_requests bigint,
  fulfilled_count bigint, rejected_count bigint, needs_review_count bigint,
  no_portal_count bigint, fulfillment_rate numeric, rejection_rate numeric,
  avg_response_days numeric, avg_data_quality numeric, avg_fee_amount numeric,
  redaction_pct numeric, hostility_score numeric, jis numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT t.id, t.jurisdiction_name, t.state, t.county, t.population, t.target_type, t.portal_difficulty_score,
    COUNT(r.id),
    COUNT(r.id) FILTER (WHERE r.status='fulfilled'),
    COUNT(r.id) FILTER (WHERE r.status='rejected'),
    COUNT(r.id) FILTER (WHERE r.status='needs_review'),
    COUNT(r.id) FILTER (WHERE r.status='no_portal'),
    CASE WHEN COUNT(r.id)>0 THEN ROUND(COUNT(r.id) FILTER (WHERE r.status='fulfilled')::numeric/COUNT(r.id)*100,1) ELSE 0 END,
    CASE WHEN COUNT(r.id)>0 THEN ROUND(COUNT(r.id) FILTER (WHERE r.status='rejected')::numeric/COUNT(r.id)*100,1) ELSE 0 END,
    COALESCE(ROUND(AVG(CASE WHEN r.status='fulfilled' AND r.sent_at IS NOT NULL AND r.response_received_at IS NOT NULL THEN EXTRACT(EPOCH FROM (r.response_received_at-r.sent_at))/86400.0 END)::numeric,1),0),
    COALESCE(ROUND(AVG(r.data_quality_score)::numeric,1),0),
    COALESCE(ROUND(AVG(r.fee_amount)::numeric,2),0),
    CASE WHEN COUNT(r.id) FILTER (WHERE r.status='fulfilled')>0 THEN ROUND(COUNT(r.id) FILTER (WHERE r.redaction_flag=true)::numeric/NULLIF(COUNT(r.id) FILTER (WHERE r.status='fulfilled'),0)*100,1) ELSE 0 END,
    CASE WHEN COUNT(r.id)>0 THEN ROUND((COUNT(r.id) FILTER (WHERE r.status='rejected')::numeric/COUNT(r.id)*50+COUNT(r.id) FILTER (WHERE r.status='needs_review')::numeric/COUNT(r.id)*30+COUNT(r.id) FILTER (WHERE r.status='no_portal')::numeric/COUNT(r.id)*20),1) ELSE 0 END,
    CASE WHEN COUNT(r.id)>0 THEN ROUND(
      (COUNT(r.id) FILTER (WHERE r.status='fulfilled')::numeric/COUNT(r.id)*100*0.35)+
      (GREATEST(0,100-COALESCE(AVG(CASE WHEN r.status='fulfilled' AND r.sent_at IS NOT NULL AND r.response_received_at IS NOT NULL THEN EXTRACT(EPOCH FROM (r.response_received_at-r.sent_at))/86400.0 END),100))*0.25)+
      ((100-COUNT(r.id) FILTER (WHERE r.status='rejected')::numeric/COUNT(r.id)*100)*0.20)+
      (COALESCE(AVG(r.data_quality_score),3)*20*0.10)+
      ((6-COALESCE(t.portal_difficulty_score,3))*20*0.10)
    ,1) ELSE 0 END
  FROM targets t LEFT JOIN foia_requests r ON r.target_id=t.id
  WHERE NOT t.is_duplicate
  GROUP BY t.id, t.jurisdiction_name, t.state, t.county, t.population, t.target_type, t.portal_difficulty_score
$$;

CREATE FUNCTION fn_state_response_analytics()
RETURNS TABLE(
  state text, total_requests bigint, fulfilled_count bigint, avg_response_days numeric,
  fulfillment_rate numeric, rejection_rate numeric, avg_data_quality numeric,
  avg_fee_amount numeric, redaction_pct numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT t.state, COUNT(r.id), COUNT(r.id) FILTER (WHERE r.status='fulfilled'),
    COALESCE(ROUND(AVG(CASE WHEN r.status='fulfilled' AND r.sent_at IS NOT NULL AND r.response_received_at IS NOT NULL THEN EXTRACT(EPOCH FROM (r.response_received_at-r.sent_at))/86400.0 END)::numeric,1),0),
    CASE WHEN COUNT(r.id)>0 THEN ROUND(COUNT(r.id) FILTER (WHERE r.status='fulfilled')::numeric/COUNT(r.id)*100,1) ELSE 0 END,
    CASE WHEN COUNT(r.id)>0 THEN ROUND(COUNT(r.id) FILTER (WHERE r.status='rejected')::numeric/COUNT(r.id)*100,1) ELSE 0 END,
    COALESCE(ROUND(AVG(r.data_quality_score)::numeric,1),0),
    COALESCE(ROUND(AVG(r.fee_amount)::numeric,2),0),
    CASE WHEN COUNT(r.id) FILTER (WHERE r.status='fulfilled')>0 THEN ROUND(COUNT(r.id) FILTER (WHERE r.redaction_flag=true)::numeric/NULLIF(COUNT(r.id) FILTER (WHERE r.status='fulfilled'),0)*100,1) ELSE 0 END
  FROM targets t INNER JOIN foia_requests r ON r.target_id=t.id
  WHERE NOT t.is_duplicate GROUP BY t.state ORDER BY COUNT(r.id) DESC
$$;

CREATE FUNCTION fn_fulfillment_overview()
RETURNS TABLE(
  total_fulfilled bigint, with_file bigint, file_upload_rate numeric, avg_quality numeric,
  format_csv bigint, format_pdf bigint, format_image bigint, format_mixed bigint,
  format_other bigint, avg_response_days numeric, avg_fee numeric, total_fees numeric,
  redacted_count bigint, avg_estimated_rows numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COUNT(*) FILTER (WHERE status='fulfilled'),
    COUNT(*) FILTER (WHERE status='fulfilled' AND fulfillment_file_url IS NOT NULL),
    CASE WHEN COUNT(*) FILTER (WHERE status='fulfilled')>0 THEN ROUND(COUNT(*) FILTER (WHERE status='fulfilled' AND fulfillment_file_url IS NOT NULL)::numeric/COUNT(*) FILTER (WHERE status='fulfilled')*100,1) ELSE 0 END,
    COALESCE(ROUND(AVG(data_quality_score) FILTER (WHERE status='fulfilled')::numeric,1),0),
    COUNT(*) FILTER (WHERE status='fulfilled' AND data_format='csv'),
    COUNT(*) FILTER (WHERE status='fulfilled' AND data_format='pdf'),
    COUNT(*) FILTER (WHERE status='fulfilled' AND data_format='image'),
    COUNT(*) FILTER (WHERE status='fulfilled' AND data_format='mixed'),
    COUNT(*) FILTER (WHERE status='fulfilled' AND data_format NOT IN ('csv','pdf','image','mixed')),
    COALESCE(ROUND(AVG(CASE WHEN status='fulfilled' AND sent_at IS NOT NULL AND response_received_at IS NOT NULL THEN EXTRACT(EPOCH FROM (response_received_at-sent_at))/86400.0 END)::numeric,1),0),
    COALESCE(ROUND(AVG(fee_amount) FILTER (WHERE fee_amount>0)::numeric,2),0),
    COALESCE(SUM(fee_amount) FILTER (WHERE fee_amount>0),0),
    COUNT(*) FILTER (WHERE redaction_flag=true),
    COALESCE(ROUND(AVG(estimated_row_count) FILTER (WHERE estimated_row_count>0)::numeric,0),0)
  FROM foia_requests
$$;

-- Storage bucket (may already exist from failed migration)
INSERT INTO storage.buckets (id, name, public) VALUES ('foia-fulfillments', 'foia-fulfillments', false) ON CONFLICT (id) DO NOTHING;