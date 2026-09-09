-- Approved by JD 2026-09-09; security containment only.
-- Backend: ojyxblegxpdgaqiscxpz. These changes are already live and this
-- idempotent migration records them durably. No row data is modified.
-- Service-role grants and existing admin/assigned-rep policies are preserved.
-- Public/customer property access and insight generation remain restricted
-- until authorization and entitlement checks are verified.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
ALTER TABLE public.marketing_leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.marketing_leads FROM PUBLIC, anon;
ALTER TABLE public.enrichment_misses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS polaris_enrichment_misses_insert ON public.enrichment_misses;
REVOKE ALL PRIVILEGES ON TABLE public.enrichment_misses FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS polaris_enrichment_update ON public.properties;
DROP POLICY IF EXISTS anon_read_properties ON public.properties;
DROP POLICY IF EXISTS anon_read_violations ON public.violations;
REVOKE ALL PRIVILEGES ON TABLE public.properties, public.violations FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bulk_upsert_violations(jsonb) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_backfill_zips_by_city_mode(text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_backfill_zips_nearest_neighbor(text,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_duplicate_property_groups(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_recent_violation_events_v1(text,text,text,integer,integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.batch_normalize_violation_types(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_bulk_insert_properties(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.backfill_violation_dates_batch(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_backfill_zips_by_city_centroids(text,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_properties_by_category(text,text,text,text,integer,integer,integer,integer,integer,text,boolean,boolean,boolean,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_fix_city_names(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_bulk_match_properties(text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_normalize_violation_types_batch(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.backfill_property_aggregates_batch(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_map_markers_in_bounds(numeric,numeric,numeric,numeric,text,text,text,integer,integer,text,integer,boolean,boolean,boolean,integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_properties_by_bbox(numeric,numeric,numeric,numeric,integer,integer,integer,integer) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS security_containment_admin_only_20260909 ON public.properties;
CREATE POLICY security_containment_admin_only_20260909 ON public.properties
AS RESTRICTIVE FOR ALL TO authenticated
USING ((SELECT public.has_role(auth.uid(), 'admin'::public.app_role)))
WITH CHECK ((SELECT public.has_role(auth.uid(), 'admin'::public.app_role)));
DROP POLICY IF EXISTS security_containment_admin_only_20260909 ON public.violations;
CREATE POLICY security_containment_admin_only_20260909 ON public.violations
AS RESTRICTIVE FOR ALL TO authenticated
USING ((SELECT public.has_role(auth.uid(), 'admin'::public.app_role)))
WITH CHECK ((SELECT public.has_role(auth.uid(), 'admin'::public.app_role)));
REVOKE EXECUTE ON FUNCTION public.fn_properties_paged(integer,integer,text,text,text,integer,integer,integer,text,boolean,boolean,boolean,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_map_markers_by_category(text,text,text,integer,integer,integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_properties_by_bbox(numeric,numeric,numeric,numeric,integer,date,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_properties_by_bbox(double precision,double precision,double precision,double precision,integer) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.claim_due_drip_enrollments(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_credit(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text,bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text,text,bigint,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text,integer,integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_refund_credits(uuid[],uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_enroll_lead_in_sequences(uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_default_pipeline_stages(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_bulk_run_inc(text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_increment_trial_exports(uuid,integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_unlock_property(uuid,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_increment_usage(text,integer,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_record_view(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_get_trial_status(uuid) FROM PUBLIC, anon;

DROP POLICY IF EXISTS "Authenticated users can view queued campaign_leads" ON public.campaign_leads;
ALTER POLICY global_suppression_read_authenticated ON public.global_sms_suppression
USING ((SELECT public.has_role(auth.uid(),'admin'::public.app_role)));
REVOKE ALL PRIVILEGES ON TABLE public.campaign_leads, public.global_sms_suppression FROM PUBLIC, anon;