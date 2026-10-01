-- SYNTHETIC STAGING ONLY. Apply after the three unchanged candidate migrations.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $check$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.snap_hosted_fixture WHERE kind='snap_hosted_synthetic' AND schema_version=1 AND state='baseline_only')
  OR EXISTS(SELECT 1 FROM auth.users) THEN RAISE EXCEPTION 'Blank synthetic staging marker required'; END IF;
 IF to_regprocedure('public.fn_crm_record_outcome_v1(uuid,uuid,timestamp with time zone,text,text,text,timestamp with time zone,boolean)') IS NULL
  OR to_regprocedure('public.fn_apply_billing_event_v1(jsonb)') IS NULL
  OR to_regprocedure('public.fn_customer_workspace_ready_v1()') IS NULL THEN RAISE EXCEPTION 'Apply all three candidate migrations first'; END IF;
END $check$;

-- Staging has no public dataset. Only specifically unlocked ordinary synthetic
-- properties become visible; existing restrictive source fences still apply.
ALTER TABLE public.unlocked_properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY hosted_fixture_own_unlocks ON public.unlocked_properties FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY hosted_fixture_released_property ON public.properties FOR SELECT TO authenticated
 USING(id IN (SELECT property_id FROM public.unlocked_properties WHERE user_id=auth.uid()));
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY hosted_fixture_own_credits ON public.user_profiles FOR SELECT TO authenticated USING(user_id=auth.uid());
ALTER TABLE public.subscription_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY hosted_fixture_own_usage ON public.subscription_usage FOR SELECT TO authenticated USING(user_id=auth.uid());

-- No client authority is inherited from the fixture's broad historical grants.
DO $rls$ DECLARE t record; BEGIN
 FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p') LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t.relname);
 END LOOP;
END $rls$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC,anon,authenticated,service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT SELECT ON public.user_roles,public.profiles,public.user_profiles,public.organizations,
 public.pipeline_stages,public.properties,public.unlocked_properties,public.subscription_plans,
 public.user_subscriptions,public.subscription_usage,public.credit_ledger,public.transactions TO authenticated;
GRANT UPDATE ON public.profiles TO authenticated;
GRANT UPDATE(name) ON public.organizations TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.leads,public.lead_activities,public.crm_contacts TO authenticated;
GRANT SELECT ON public.owners,public.lead_tags,public.lead_tag_assignments,public.sms_threads,
 public.sms_messages,public.drip_sequences,public.drip_steps,public.drip_enrollments,
 public.suppression_list,public.user_integrations,public.integration_action_log TO authenticated;

GRANT EXECUTE ON FUNCTION public.has_role(uuid,public.app_role),public.fn_check_unlocked_batch(uuid,uuid[]),
 public.current_user_org_id(),
 public.fn_is_source_property_v1(uuid),public.fn_source_property_visible_v1(uuid),
 public.fn_source_lead_visible_v1(uuid,uuid),public.fn_customer_workspace_ready_v1(),
 public.fn_crm_add_property_v1(uuid),
 public.fn_crm_record_outcome_v1(uuid,uuid,timestamptz,text,text,text,timestamptz,boolean),
 public.fn_get_user_subscription(uuid),public.fn_get_current_usage(uuid),
 public.fn_check_subscription_limit(text,integer,uuid),public.fn_get_trial_status(uuid) TO authenticated;
-- These candidate RPCs retain service-only access; no all-functions service grant.
GRANT EXECUTE ON FUNCTION public.fn_begin_billing_sync_v1(),public.fn_billing_checkout_enabled_v1(),
 public.fn_billing_account_open_v1(uuid),public.fn_apply_billing_event_v1(jsonb),
 public.fn_record_account_closure_v1(uuid,text),public.fn_workspace_backfill_report_v1(),
 public.fn_provision_customer_workspace_v1(uuid,text) TO service_role;

-- The browser's credit read is scoped by the caller and the ledger's own RLS.
CREATE OR REPLACE VIEW public.v_user_credits WITH(security_invoker=true) AS
 SELECT auth.uid() AS user_id,coalesce(sum(delta),0)::bigint AS balance
 FROM public.credit_ledger WHERE user_id=auth.uid() HAVING auth.uid() IS NOT NULL;
REVOKE ALL ON public.v_user_credits FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.v_user_credits TO authenticated;

-- This fixture intentionally cannot release source details. A real source
-- receipt graph is absent; never synthesize a successful municipal evidence view.
CREATE FUNCTION public.fn_get_source_crm_detail_v1(p_lead_id uuid) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$ BEGIN
 RAISE EXCEPTION 'Source detail is held in this synthetic staging baseline' USING ERRCODE='42501'; END $$;
REVOKE ALL ON FUNCTION public.fn_get_source_crm_detail_v1(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.fn_get_source_crm_detail_v1(uuid) TO authenticated;

REVOKE ALL ON SCHEMA snap_relaunch FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA snap_relaunch FROM PUBLIC,anon,authenticated,service_role;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA snap_relaunch FROM PUBLIC,anon,authenticated,service_role;
DO $source_rls$ DECLARE t record; BEGIN
 FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='snap_relaunch' AND c.relkind IN ('r','p') LOOP
  EXECUTE format('ALTER TABLE snap_relaunch.%I ENABLE ROW LEVEL SECURITY',t.relname);
 END LOOP;
END $source_rls$;
-- The marker is immutable through HTTP, including service-role HTTP clients.
REVOKE ALL ON public.snap_hosted_fixture FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.snap_hosted_fixture TO service_role;

DO $managed$ DECLARE before_auth text;before_realtime text;after_auth text;after_realtime text; BEGIN
 SELECT managed_auth_fingerprint,realtime_fingerprint INTO before_auth,before_realtime FROM public.snap_hosted_fixture;
 SELECT md5(jsonb_agg(to_jsonb(s) ORDER BY kind,name)::text) INTO after_auth FROM (
  SELECT 'function' kind,p.oid::regprocedure::text name,pg_get_functiondef(p.oid) definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='auth' AND p.prokind='f'
  UNION ALL SELECT 'column',a.attname,format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull||':'||coalesce(pg_get_expr(d.adbin,d.adrelid),'')
  FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attrelid='auth.users'::regclass AND a.attnum>0 AND NOT a.attisdropped
  UNION ALL SELECT 'constraint',conname,pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='auth.users'::regclass
 ) s;
 SELECT md5(jsonb_build_object('publications',
  (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY pubname),'[]') FROM pg_publication p),
  'tables',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY pubname,schemaname,tablename),'[]') FROM pg_publication_tables t))::text) INTO after_realtime;
 IF before_auth IS DISTINCT FROM after_auth OR before_realtime IS DISTINCT FROM after_realtime THEN
  RAISE EXCEPTION 'Managed Auth or realtime definitions changed'; END IF;
 IF (SELECT public.fn_billing_checkout_enabled_v1()) THEN RAISE EXCEPTION 'Checkout must remain held'; END IF;
END $managed$;
UPDATE public.snap_hosted_fixture SET state='ready';
NOTIFY pgrst,'reload schema';
COMMIT;
