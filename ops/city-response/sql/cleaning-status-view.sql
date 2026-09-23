BEGIN;
CREATE VIEW public.city_receipt_cleaning_status_v1 WITH (security_invoker=true) AS
SELECT c.receipt_id,c.request_id,c.agency_key,c.adapter_version,c.state,c.error_code,c.updated_at,
 (c.report->>'input_records')::integer AS input_records,
 (c.report->>'passed_records')::integer AS passing_records,
 (c.report->>'held_records')::integer AS held_records,
 CASE WHEN c.state='imported' THEN (c.import_result->>'imported')::integer+(c.import_result->>'reused')::integer ELSE NULL END AS insight_ready,
 CASE WHEN c.state='imported' THEN (c.import_result->>'held')::integer ELSE NULL END AS import_held,
 coalesce((SELECT jsonb_agg(jsonb_build_object('code',x.reason,'rows',x.n) ORDER BY x.reason)
 FROM (SELECT reason,count(*) n FROM jsonb_array_elements(c.report->'records') r CROSS JOIN LATERAL jsonb_array_elements_text(r->'review_reasons') reason GROUP BY reason) x),'[]'::jsonb) AS review_reasons,
 c.report->>'file_review_reason' AS file_review_reason
FROM public.collection_receipt_cleaning_v1 c;
REVOKE ALL ON public.city_receipt_cleaning_status_v1 FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.city_receipt_cleaning_status_v1 TO service_role;
COMMIT;
