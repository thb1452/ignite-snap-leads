-- B15/B07/B08/C14. Candidate migration; review the backfill report before any production call.
-- No existing profile or business row is reassigned by this migration.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
  IF to_regprocedure('public.handle_new_user()') IS NULL
    OR md5(pg_get_functiondef('public.handle_new_user()'::regprocedure)) IS DISTINCT FROM '34dad4058056a2f20f88e4577caf5903' THEN
    RAISE EXCEPTION 'Signup baseline drift; review deployed provisioning before migration';
  END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS snap_security;
REVOKE ALL ON SCHEMA snap_security FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA snap_security TO authenticated, service_role;

-- This registry, not caller-editable profile fields, establishes personal-workspace ownership.
CREATE TABLE snap_security.workspace_owners (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE RESTRICT,
  previous_org_id uuid,
  provisioned_at timestamptz NOT NULL DEFAULT now(),
  provision_reason text NOT NULL CHECK (provision_reason IN ('signup', 'reviewed_backfill')),
  review_reference text
);
ALTER TABLE snap_security.workspace_owners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON snap_security.workspace_owners FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION snap_security.can_access_workspace(p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM auth.users a JOIN public.profiles p ON p.user_id = a.id
    WHERE a.id = auth.uid() AND p.org_id = p_org_id
      AND a.deleted_at IS NULL AND NOT coalesce(a.is_anonymous, false)
      AND (a.banned_until IS NULL OR a.banned_until <= now())
      AND (
        EXISTS (SELECT 1 FROM snap_security.workspace_owners w WHERE w.user_id = a.id AND w.org_id = p_org_id)
        OR (p_org_id = '00000000-0000-0000-0000-000000000001'::uuid
          AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = a.id AND r.role = 'admin'))
      )
  );
$$;
REVOKE ALL ON FUNCTION snap_security.can_access_workspace(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION snap_security.can_access_workspace(uuid) TO authenticated, service_role;

CREATE FUNCTION public.fn_customer_workspace_ready_v1()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
 SELECT coalesce((SELECT snap_security.can_access_workspace(p.org_id)
   FROM public.profiles p WHERE p.user_id = auth.uid()), false);
$$;
REVOKE ALL ON FUNCTION public.fn_customer_workspace_ready_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_customer_workspace_ready_v1() TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE workspace uuid;
BEGIN
  -- Display metadata may supply a name, never a role, org, or membership.
  INSERT INTO public.user_profiles (user_id, credits) VALUES (NEW.id, 10) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = NEW.id) THEN
    RAISE EXCEPTION 'Profile already exists during signup' USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.organizations(name, credits) VALUES ('Personal workspace', 0) RETURNING id INTO workspace;
  INSERT INTO snap_security.workspace_owners(user_id, org_id, provision_reason)
    VALUES (NEW.id, workspace, 'signup');
  INSERT INTO public.profiles(user_id, org_id, email, full_name)
    VALUES (NEW.id, workspace, NEW.email, nullif(btrim(coalesce(NEW.raw_user_meta_data->>'full_name','')), ''));
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated, service_role;

-- Prevent client account reassignment even when a permissive legacy/admin policy exists.
CREATE FUNCTION snap_security.protect_profile_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND
     (TG_OP <> 'UPDATE' OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.org_id IS DISTINCT FROM OLD.org_id) THEN
    RAISE EXCEPTION 'Workspace identity is server managed' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION snap_security.protect_profile_identity() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER protect_profile_identity BEFORE INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION snap_security.protect_profile_identity();

-- Restrictive fences compose with existing policies; they never grant property/source access.
-- Leave the internal FOIA schema, assignments and intake rows unchanged.
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['pipeline_stages','leads','lead_activities','lead_tags','owners',
    'user_integrations','sms_threads','sms_messages','drip_sequences','drip_enrollments'] LOOP
    EXECUTE format('CREATE POLICY customer_workspace_fence_v1 ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (snap_security.can_access_workspace(org_id)) WITH CHECK (snap_security.can_access_workspace(org_id))', tbl);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', tbl);
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated', tbl);
  END LOOP;
END $$;
CREATE POLICY customer_organization_fence_v1 ON public.organizations AS RESTRICTIVE FOR ALL TO authenticated
 USING (snap_security.can_access_workspace(id)) WITH CHECK (snap_security.can_access_workspace(id));
REVOKE ALL ON public.organizations FROM PUBLIC, anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.organizations FROM authenticated;
GRANT UPDATE(name) ON public.organizations TO authenticated;
-- Credential pointers and spend counters are service-managed through the integration APIs.
REVOKE INSERT,UPDATE,DELETE ON public.user_integrations FROM authenticated;
-- Global opt-outs remain available to service-role suppression enforcement, not raw client listing.
CREATE POLICY customer_suppression_fence_v1 ON public.suppression_list AS RESTRICTIVE FOR ALL TO authenticated
 USING (org_id IS NOT NULL AND snap_security.can_access_workspace(org_id))
 WITH CHECK (org_id IS NOT NULL AND snap_security.can_access_workspace(org_id));
REVOKE ALL ON public.suppression_list, public.lead_tag_assignments, public.drip_steps, public.integration_action_log FROM PUBLIC, anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.suppression_list, public.lead_tag_assignments, public.drip_steps, public.integration_action_log FROM authenticated;

-- Add tenant keys to the FK itself so service-role writers cannot create cross-org graphs.
ALTER TABLE public.pipeline_stages ADD CONSTRAINT pipeline_stages_id_org_unique UNIQUE(id, org_id);
ALTER TABLE public.leads ADD CONSTRAINT leads_id_org_unique UNIQUE(id, org_id);
ALTER TABLE public.owners ADD CONSTRAINT owners_id_org_unique UNIQUE(id, org_id);
ALTER TABLE public.sms_threads ADD CONSTRAINT sms_threads_id_org_unique UNIQUE(id, org_id);
ALTER TABLE public.drip_sequences ADD CONSTRAINT drip_sequences_id_org_unique UNIQUE(id, org_id);
ALTER TABLE public.leads ADD CONSTRAINT leads_stage_workspace_fk FOREIGN KEY(stage_id,org_id) REFERENCES public.pipeline_stages(id,org_id) ON DELETE RESTRICT;
ALTER TABLE public.leads ADD CONSTRAINT leads_owner_workspace_fk FOREIGN KEY(owner_id,org_id) REFERENCES public.owners(id,org_id) ON DELETE RESTRICT;
ALTER TABLE public.lead_activities ADD CONSTRAINT activities_lead_workspace_fk FOREIGN KEY(lead_id,org_id) REFERENCES public.leads(id,org_id) ON DELETE CASCADE;
ALTER TABLE public.sms_threads ADD CONSTRAINT threads_lead_workspace_fk FOREIGN KEY(lead_id,org_id) REFERENCES public.leads(id,org_id) ON DELETE RESTRICT;
ALTER TABLE public.sms_messages ADD CONSTRAINT messages_thread_workspace_fk FOREIGN KEY(thread_id,org_id) REFERENCES public.sms_threads(id,org_id) ON DELETE CASCADE;
ALTER TABLE public.drip_enrollments ADD CONSTRAINT enrollment_lead_workspace_fk FOREIGN KEY(lead_id,org_id) REFERENCES public.leads(id,org_id) ON DELETE CASCADE;
ALTER TABLE public.drip_enrollments ADD CONSTRAINT enrollment_sequence_workspace_fk FOREIGN KEY(sequence_id,org_id) REFERENCES public.drip_sequences(id,org_id) ON DELETE CASCADE;

CREATE FUNCTION snap_security.guard_crm_relationships()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  -- A SECURITY DEFINER handoff must not bypass workspace readiness for its user.
  -- Service jobs without a user subject still face the relational constraints below.
  IF TG_TABLE_NAME IN ('leads','lead_activities','owners','user_integrations') THEN
    IF auth.uid() IS NOT NULL AND NOT snap_security.can_access_workspace(NEW.org_id) THEN
      RAISE EXCEPTION 'Customer workspace is not ready' USING ERRCODE='42501';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'leads' THEN
    IF TG_OP = 'UPDATE' AND (NEW.org_id IS DISTINCT FROM OLD.org_id OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.property_id IS DISTINCT FROM OLD.property_id) THEN
      RAISE EXCEPTION 'Lead identity is immutable; archive instead' USING ERRCODE='42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=NEW.created_by AND p.org_id=NEW.org_id)
      OR (NEW.assigned_to IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=NEW.assigned_to AND p.org_id=NEW.org_id)) THEN
      RAISE EXCEPTION 'Lead user must belong to workspace' USING ERRCODE='23514';
    END IF;
    IF NEW.owner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.owners o WHERE o.id=NEW.owner_id AND o.org_id=NEW.org_id AND o.property_id=NEW.property_id) THEN
      RAISE EXCEPTION 'Contact must belong to lead property and workspace' USING ERRCODE='23514';
    END IF;
    IF TG_OP='INSERT' AND current_user='authenticated' THEN
      IF NEW.created_by IS DISTINCT FROM auth.uid() OR NOT EXISTS (SELECT 1 FROM public.properties p WHERE p.id=NEW.property_id)
        OR NOT EXISTS (SELECT 1 FROM public.fn_check_unlocked_batch(auth.uid(),ARRAY[NEW.property_id]) u WHERE u.property_id=NEW.property_id) THEN
        RAISE EXCEPTION 'Property access and unlock required' USING ERRCODE='42501';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME='lead_activities' THEN
    IF current_user='authenticated' AND NEW.actor_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Activity actor must be current account' USING ERRCODE='42501';
    END IF;
  ELSIF TG_TABLE_NAME='lead_tag_assignments' THEN
    IF NOT EXISTS (SELECT 1 FROM public.leads l JOIN public.lead_tags t ON t.org_id=l.org_id WHERE l.id=NEW.lead_id AND t.id=NEW.tag_id) THEN
      RAISE EXCEPTION 'Tag and lead must belong to workspace' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME='user_integrations' THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=NEW.user_id AND p.org_id=NEW.org_id) THEN
      RAISE EXCEPTION 'Integration owner must belong to workspace' USING ERRCODE='23514';
    END IF;
    IF current_user='authenticated' AND NEW.user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Integration owner must be current account' USING ERRCODE='42501';
    END IF;
  ELSIF TG_TABLE_NAME='owners' THEN
    IF TG_OP='UPDATE' AND (NEW.org_id IS DISTINCT FROM OLD.org_id OR NEW.property_id IS DISTINCT FROM OLD.property_id) THEN
      RAISE EXCEPTION 'Owner identity is immutable' USING ERRCODE='42501';
    END IF;
    IF NEW.created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=NEW.created_by AND p.org_id=NEW.org_id) THEN
      RAISE EXCEPTION 'Contact creator must belong to workspace' USING ERRCODE='23514';
    END IF;
    IF current_user='authenticated' AND NEW.created_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Contact creator must be current account' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION snap_security.guard_crm_relationships() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER guard_crm_relationships BEFORE INSERT OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION snap_security.guard_crm_relationships();
CREATE TRIGGER guard_crm_relationships BEFORE INSERT OR UPDATE ON public.lead_activities FOR EACH ROW EXECUTE FUNCTION snap_security.guard_crm_relationships();
CREATE TRIGGER guard_crm_relationships BEFORE INSERT OR UPDATE ON public.lead_tag_assignments FOR EACH ROW EXECUTE FUNCTION snap_security.guard_crm_relationships();
CREATE TRIGGER guard_crm_relationships BEFORE INSERT OR UPDATE ON public.user_integrations FOR EACH ROW EXECUTE FUNCTION snap_security.guard_crm_relationships();
CREATE TRIGGER guard_crm_relationships BEFORE INSERT OR UPDATE ON public.owners FOR EACH ROW EXECUTE FUNCTION snap_security.guard_crm_relationships();

-- B07: a provider result belongs to one workspace; a second customer cannot move it.
CREATE UNIQUE INDEX ux_owners_workspace_property_source ON public.owners(org_id,property_id,source);
DROP INDEX public.ux_owners_property_source;

-- B08: source cleanup must not cascade into customer history. Keep IDs and content intact.
ALTER TABLE public.leads DROP CONSTRAINT leads_property_id_fkey;
ALTER TABLE public.leads ADD CONSTRAINT leads_property_id_fkey FOREIGN KEY(property_id) REFERENCES public.properties(id) ON DELETE RESTRICT;
ALTER TABLE public.owners DROP CONSTRAINT owners_property_id_fkey;
ALTER TABLE public.owners ADD CONSTRAINT owners_property_id_fkey FOREIGN KEY(property_id) REFERENCES public.properties(id) ON DELETE RESTRICT;

ALTER TABLE public.lead_activity DROP CONSTRAINT lead_activity_property_id_fkey;
ALTER TABLE public.lead_activity ADD CONSTRAINT lead_activity_property_id_fkey FOREIGN KEY(property_id) REFERENCES public.properties(id) ON DELETE RESTRICT;
ALTER TABLE public.list_properties DROP CONSTRAINT list_properties_property_id_fkey;
ALTER TABLE public.list_properties ADD CONSTRAINT list_properties_property_id_fkey FOREIGN KEY(property_id) REFERENCES public.properties(id) ON DELETE RESTRICT;
ALTER TABLE public.unlocked_properties DROP CONSTRAINT unlocked_properties_property_id_fkey;
ALTER TABLE public.unlocked_properties ADD CONSTRAINT unlocked_properties_property_id_fkey FOREIGN KEY(property_id) REFERENCES public.properties(id) ON DELETE RESTRICT;

-- C14: expiration/revocation removes source-detail access, not the customer's private CRM work.
-- Existing source property/detail/export functions and immutable receipts are left intact.
CREATE OR REPLACE FUNCTION public.fn_source_lead_visible_v1(p_lead_id uuid,p_property_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM snap_relaunch.source_crm_links WHERE lead_id=p_lead_id) THEN
    RETURN NOT public.fn_is_source_property_v1(coalesce(p_property_id,(SELECT property_id FROM public.leads WHERE id=p_lead_id)));
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM snap_relaunch.source_crm_links s JOIN public.leads l ON l.id=s.lead_id
    JOIN public.profiles p ON p.user_id=auth.uid()
    WHERE s.lead_id=p_lead_id AND s.consumer_user_id=auth.uid() AND l.created_by=auth.uid()
      AND l.org_id=s.org_id AND p.org_id=s.org_id AND snap_security.can_access_workspace(s.org_id)
  );
END $$;
-- Linked source annotation remains governed by its live acceptance. Ordinary private notes survive.
CREATE FUNCTION snap_security.source_activity_visible(p_activity_id uuid,p_lead_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE receipt record;
BEGIN
  IF NOT public.fn_source_lead_visible_v1(p_lead_id) THEN RETURN false; END IF;
  FOR receipt IN SELECT acceptance_id FROM snap_relaunch.source_crm_links WHERE activity_id=p_activity_id LOOP
    BEGIN
      PERFORM snap_relaunch.require_source_acceptance_v1(receipt.acceptance_id,'crm');
    EXCEPTION WHEN SQLSTATE '42501' THEN RETURN false;
    END;
  END LOOP;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION snap_security.source_activity_visible(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION snap_security.source_activity_visible(uuid,uuid) TO authenticated;
ALTER POLICY source_lead_activity_fence_v1 ON public.lead_activities
 USING (snap_security.source_activity_visible(id,lead_id)) WITH CHECK (snap_security.source_activity_visible(id,lead_id));

-- Preflight is read-only and records per-table ownership conflicts; no blanket reparenting.
CREATE FUNCTION snap_security.workspace_backfill_preflight(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE old_org uuid; conflicts jsonb:='{}'; tbl record; n bigint;
BEGIN
  SELECT org_id INTO old_org FROM public.profiles WHERE user_id=p_user_id;
  IF old_org IS NULL THEN RETURN jsonb_build_object('eligible',false,'reason','profile_missing'); END IF;
  IF EXISTS (SELECT 1 FROM snap_security.workspace_owners WHERE user_id=p_user_id AND org_id=old_org) THEN
    RETURN jsonb_build_object('eligible',true,'reason','already_provisioned','org_id',old_org);
  END IF;
  IF old_org <> '00000000-0000-0000-0000-000000000001'::uuid THEN
    RETURN jsonb_build_object('eligible',false,'reason','unreviewed_existing_workspace','org_id',old_org);
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=p_user_id AND role IN ('admin','va'))
    OR EXISTS (SELECT 1 FROM public.foia_profiles WHERE id=p_user_id) THEN
    RETURN jsonb_build_object('eligible',false,'reason','internal_staff_preserved','org_id',old_org);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=p_user_id AND deleted_at IS NULL AND NOT coalesce(is_anonymous,false)) THEN
    RETURN jsonb_build_object('eligible',false,'reason','account_unavailable');
  END IF;
  -- Detect ownership-bearing rows across current and future public org-scoped tables.
  FOR tbl IN SELECT c.table_name, string_agg(format('%I = $2', c.column_name),' OR ') AS filters
    FROM information_schema.columns c WHERE c.table_schema='public'
      AND c.table_name <> 'profiles' AND c.udt_name='uuid'
      AND c.column_name IN ('user_id','created_by','assigned_to','actor_id','uploaded_by','added_by','enrolled_by','sent_by')
      AND EXISTS (SELECT 1 FROM information_schema.columns o WHERE o.table_schema=c.table_schema AND o.table_name=c.table_name AND o.column_name='org_id')
    GROUP BY c.table_name LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE org_id=$1 AND (%s)',tbl.table_name,tbl.filters) INTO n USING old_org,p_user_id;
    IF n > 0 THEN conflicts:=conflicts||jsonb_build_object(tbl.table_name,n); END IF;
  END LOOP;
  SELECT count(*) INTO n FROM snap_relaunch.customer_source_acceptances WHERE consumer_user_id=p_user_id;
  IF n>0 THEN conflicts:=conflicts||jsonb_build_object('customer_source_acceptances',n); END IF;
  SELECT count(*) INTO n FROM snap_relaunch.source_crm_links WHERE consumer_user_id=p_user_id;
  IF n>0 THEN conflicts:=conflicts||jsonb_build_object('source_crm_links',n); END IF;
  RETURN jsonb_build_object('eligible',conflicts='{}'::jsonb,'reason',CASE WHEN conflicts='{}'::jsonb THEN 'ready_without_row_moves' ELSE 'owned_rows_need_review' END,'org_id',old_org,'conflicts',conflicts);
END $$;
REVOKE ALL ON FUNCTION snap_security.workspace_backfill_preflight(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.fn_workspace_backfill_report_v1()
RETURNS TABLE(user_id uuid,assessment jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT p.user_id,snap_security.workspace_backfill_preflight(p.user_id) FROM public.profiles p ORDER BY p.user_id;
$$;
CREATE FUNCTION public.fn_provision_customer_workspace_v1(p_user_id uuid,p_review_reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE state jsonb; workspace uuid; old_org uuid; relation record;
BEGIN
  IF length(btrim(coalesce(p_review_reference,''))) < 8 THEN RAISE EXCEPTION 'Review reference required'; END IF;
  -- Prevent a racing legacy writer from adding rows between preflight and reassignment.
  LOCK TABLE public.profiles IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.leads, public.owners, public.user_integrations, public.lead_activities,
    public.sms_threads, public.sms_messages, public.drip_sequences, public.drip_enrollments,
    public.suppression_list IN SHARE ROW EXCLUSIVE MODE;
  -- Also lock any added org-scoped ownership table detected by the preflight.
  FOR relation IN SELECT DISTINCT c.table_name FROM information_schema.columns c
    WHERE c.table_schema='public' AND c.udt_name='uuid'
      AND c.column_name IN ('user_id','created_by','assigned_to','actor_id','uploaded_by','added_by','enrolled_by','sent_by')
      AND EXISTS (SELECT 1 FROM information_schema.columns o WHERE o.table_schema=c.table_schema AND o.table_name=c.table_name AND o.column_name='org_id')
    ORDER BY c.table_name LOOP
    EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE',relation.table_name);
  END LOOP;
  LOCK TABLE snap_relaunch.customer_source_acceptances, snap_relaunch.source_crm_links IN SHARE ROW EXCLUSIVE MODE;
  state:=snap_security.workspace_backfill_preflight(p_user_id);
  IF NOT (state->>'eligible')::boolean THEN RAISE EXCEPTION 'Workspace backfill blocked: %',state; END IF;
  IF state->>'reason'='already_provisioned' THEN RETURN state||jsonb_build_object('replayed',true); END IF;
  old_org:=(state->>'org_id')::uuid;
  INSERT INTO public.organizations(name,credits) VALUES ('Personal workspace',0) RETURNING id INTO workspace;
  INSERT INTO snap_security.workspace_owners(user_id,org_id,previous_org_id,provision_reason,review_reference)
    VALUES (p_user_id,workspace,old_org,'reviewed_backfill',btrim(p_review_reference));
  UPDATE public.profiles SET org_id=workspace WHERE user_id=p_user_id;
  RETURN jsonb_build_object('user_id',p_user_id,'org_id',workspace,'previous_org_id',old_org,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.fn_workspace_backfill_report_v1(),public.fn_provision_customer_workspace_v1(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_workspace_backfill_report_v1(),public.fn_provision_customer_workspace_v1(uuid,text) TO service_role;
COMMIT;
