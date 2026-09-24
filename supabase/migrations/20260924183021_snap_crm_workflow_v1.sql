-- Private manual CRM workflow. No provider sends, public data release or credit spend.
BEGIN;
ALTER TABLE public.leads
 ADD COLUMN IF NOT EXISTS title text,
 ADD COLUMN IF NOT EXISTS contact_restricted boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS next_action text,
 ADD COLUMN IF NOT EXISTS estimated_value numeric(14,2),
 ADD COLUMN IF NOT EXISTS estimated_repairs numeric(14,2),
 ADD COLUMN IF NOT EXISTS offer_amount numeric(14,2),
 ADD COLUMN IF NOT EXISTS contract_deadline date;
-- Existing due dates predate named actions. Preserve the date and attach a
-- neutral action label; do not silently clear an existing follow-up commitment.
UPDATE public.leads SET next_action='Review saved follow-up'
 WHERE next_follow_up_at IS NOT NULL AND next_action IS NULL;
ALTER TABLE public.leads ADD CONSTRAINT crm_lead_input_bounds CHECK (
 (title IS NULL OR length(title)<=240) AND (next_action IS NULL OR length(btrim(next_action)) BETWEEN 1 AND 500)
 AND ((next_action IS NULL)=(next_follow_up_at IS NULL))
 AND (estimated_value IS NULL OR estimated_value BETWEEN 0 AND 999999999999.99)
 AND (estimated_repairs IS NULL OR estimated_repairs BETWEEN 0 AND 999999999999.99)
 AND (offer_amount IS NULL OR offer_amount BETWEEN 0 AND 999999999999.99));

-- Contacts are user-entered private relationships, never a copy of public enrichment.
CREATE TABLE public.crm_contacts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
 org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 160),
 relationship text NOT NULL DEFAULT 'owner' CHECK(relationship IN ('owner','buyer','agent','other')),
 phone text CHECK(phone IS NULL OR length(phone)<=50),
 email text CHECK(email IS NULL OR length(email)<=254),
 source text NOT NULL CHECK(length(btrim(source)) BETWEEN 1 AND 500),
 do_not_contact boolean NOT NULL DEFAULT false,
 restriction_note text CHECK(restriction_note IS NULL OR length(restriction_note)<=1000),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.crm_contacts ADD CONSTRAINT crm_contacts_lead_workspace_fk FOREIGN KEY(lead_id,org_id) REFERENCES public.leads(id,org_id) ON DELETE CASCADE;
CREATE INDEX crm_contacts_lead_idx ON public.crm_contacts(lead_id);
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_contacts FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.crm_contacts TO authenticated;
GRANT ALL ON public.crm_contacts TO service_role;
CREATE POLICY crm_contacts_private ON public.crm_contacts FOR ALL TO authenticated
 USING(snap_security.can_access_workspace(org_id) AND EXISTS (
  SELECT 1 FROM public.leads l WHERE l.id=lead_id AND l.org_id=crm_contacts.org_id))
 WITH CHECK(snap_security.can_access_workspace(org_id) AND EXISTS (
  SELECT 1 FROM public.leads l WHERE l.id=lead_id AND l.org_id=crm_contacts.org_id));
CREATE FUNCTION snap_security.guard_crm_contact_v1() RETURNS trigger LANGUAGE plpgsql
 SECURITY INVOKER SET search_path=pg_catalog AS $$ BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.lead_id IS DISTINCT FROM OLD.lead_id OR NEW.org_id IS DISTINCT FROM OLD.org_id THEN
   RAISE EXCEPTION 'Contact relationship cannot be reassigned' USING ERRCODE='42501'; END IF;
  -- Suppression cannot be silently cleared through a normal editor/import.
  IF OLD.do_not_contact AND NOT NEW.do_not_contact THEN
   RAISE EXCEPTION 'A contact restriction cannot be cleared in this workflow' USING ERRCODE='42501'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.leads WHERE id=NEW.lead_id AND contact_restricted) THEN NEW.do_not_contact:=true; END IF;
 NEW.updated_at:=clock_timestamp(); RETURN NEW; END $$;
CREATE TRIGGER crm_contact_guard BEFORE INSERT OR UPDATE ON public.crm_contacts
 FOR EACH ROW EXECUTE FUNCTION snap_security.guard_crm_contact_v1();
REVOKE ALL ON FUNCTION snap_security.guard_crm_contact_v1() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION snap_security.preserve_crm_restriction_v1() RETURNS trigger LANGUAGE plpgsql
 SECURITY INVOKER SET search_path=pg_catalog AS $$ BEGIN
 IF OLD.contact_restricted AND NOT NEW.contact_restricted THEN
  RAISE EXCEPTION 'Contact restriction requires a separate reviewed resolution' USING ERRCODE='42501'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER crm_lead_restriction_guard BEFORE UPDATE ON public.leads
 FOR EACH ROW EXECUTE FUNCTION snap_security.preserve_crm_restriction_v1();
REVOKE ALL ON FUNCTION snap_security.preserve_crm_restriction_v1() FROM PUBLIC,anon,authenticated;

-- Serialization by account/property plus the existing UNIQUE prevents duplicate
-- creation. Restore returns the same lead, stage and private history.
CREATE FUNCTION public.fn_crm_add_property_v1(p_property_id uuid) RETURNS public.leads
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE org uuid; stage uuid; result public.leads; label text; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 SELECT p.org_id INTO org FROM public.profiles p WHERE p.user_id=auth.uid();
 IF NOT coalesce(snap_security.can_access_workspace(org),false) THEN
  RAISE EXCEPTION 'Private workspace unavailable' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(org::text||':'||p_property_id::text,0));
 SELECT * INTO result FROM public.leads WHERE org_id=org AND property_id=p_property_id FOR UPDATE;
 IF FOUND THEN
  IF result.archived_at IS NOT NULL THEN
   UPDATE public.leads SET archived_at=NULL WHERE id=result.id RETURNING * INTO result;
   INSERT INTO public.lead_activities(lead_id,org_id,actor_id,activity_type,payload)
    VALUES(result.id,org,auth.uid(),'system','{"description":"Lead restored with its existing private history."}');
  END IF;
  RETURN result;
 END IF;
 IF public.fn_is_source_property_v1(p_property_id) THEN
  RAISE EXCEPTION 'Use the approved source handoff for this property' USING ERRCODE='42501'; END IF;
 SELECT p.address INTO label FROM public.properties p WHERE p.id=p_property_id;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.fn_check_unlocked_batch(auth.uid(),ARRAY[p_property_id])) THEN
  RAISE EXCEPTION 'This property is not currently available to this account' USING ERRCODE='42501'; END IF;
 SELECT id INTO stage FROM public.pipeline_stages WHERE org_id=org ORDER BY sort_order,id LIMIT 1;
 IF stage IS NULL THEN RAISE EXCEPTION 'Pipeline stages unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO public.leads(org_id,property_id,stage_id,created_by,assigned_to,source,title)
  VALUES(org,p_property_id,stage,auth.uid(),auth.uid(),'manual',left(label,240)) RETURNING * INTO result;
 INSERT INTO public.lead_activities(lead_id,org_id,actor_id,activity_type,payload)
  VALUES(result.id,org,auth.uid(),'system','{"description":"Property saved to the private pipeline."}');
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.fn_crm_add_property_v1(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.fn_crm_add_property_v1(uuid) TO authenticated;

-- A manual outcome, completed action and replacement action commit atomically.
-- Reusing a request UUID is safe only with the exact same command.
CREATE FUNCTION public.fn_crm_record_outcome_v1(p_lead_id uuid,p_request_id uuid,p_expected_updated_at timestamptz,
 p_outcome text,p_note text,p_next_action text,p_due_at timestamptz,p_complete_action boolean)
 RETURNS public.leads LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE lead public.leads; prior public.lead_activities; command jsonb; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_outcome NOT IN ('reached_owner','no_answer','wrong_number','research','offer_sent','appointment','do_not_contact')
  OR p_outcome IS NULL OR coalesce(length(p_note),0)>4000 OR coalesce(length(p_next_action),0)>500
  OR (nullif(btrim(p_next_action),'') IS NULL)<>(p_due_at IS NULL) OR p_complete_action IS NULL THEN
  RAISE EXCEPTION 'Choose an outcome and supply both next action and date, or neither' USING ERRCODE='22023'; END IF;
 SELECT * INTO lead FROM public.leads WHERE id=p_lead_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lead unavailable' USING ERRCODE='42501'; END IF;
 command:=jsonb_build_object('outcome',p_outcome,'note',coalesce(p_note,''),'next_action',nullif(btrim(p_next_action),''),
  'due_at',p_due_at,'completed_action',p_complete_action,'expected_updated_at',p_expected_updated_at);
 SELECT * INTO prior FROM public.lead_activities WHERE id=p_request_id;
 IF FOUND THEN
  IF prior.lead_id<>p_lead_id OR prior.actor_id IS DISTINCT FROM auth.uid() OR prior.payload->'command' IS DISTINCT FROM command THEN
   RAISE EXCEPTION 'Request ID already used for another action' USING ERRCODE='22023'; END IF;
  RETURN lead;
 END IF;
 IF lead.updated_at IS DISTINCT FROM p_expected_updated_at THEN
  RAISE EXCEPTION 'Lead changed. Refresh before recording this outcome.' USING ERRCODE='40001'; END IF;
 IF lead.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Restore this lead before recording work' USING ERRCODE='22023'; END IF;
 INSERT INTO public.lead_activities(id,lead_id,org_id,actor_id,activity_type,payload)
 VALUES(p_request_id,lead.id,lead.org_id,auth.uid(),'task',jsonb_build_object('command',command,
  'outcome',p_outcome,'note',coalesce(p_note,''),'completed_action',CASE WHEN p_complete_action THEN lead.next_action ELSE NULL END,
  'next_action',nullif(btrim(p_next_action),''),'due_at',p_due_at,'description','Manual work recorded; no message or call was sent by Snap.'));
 UPDATE public.leads SET contact_restricted=contact_restricted OR p_outcome='do_not_contact',next_action=nullif(btrim(p_next_action),''),next_follow_up_at=p_due_at,
  last_contacted_at=CASE WHEN p_outcome='reached_owner' THEN clock_timestamp() ELSE last_contacted_at END,
  updated_at=clock_timestamp() WHERE id=lead.id RETURNING * INTO lead;
 -- Keep the opt-out visible on every existing relationship for this opportunity.
 IF p_outcome='do_not_contact' THEN UPDATE public.crm_contacts SET do_not_contact=true,
  restriction_note=left(coalesce(nullif(p_note,''),'Do not contact requested during manually logged work'),1000) WHERE lead_id=lead.id; END IF;
 RETURN lead;
END $$;
REVOKE ALL ON FUNCTION public.fn_crm_record_outcome_v1(uuid,uuid,timestamptz,text,text,text,timestamptz,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.fn_crm_record_outcome_v1(uuid,uuid,timestamptz,text,text,text,timestamptz,boolean) TO authenticated;
COMMIT;
