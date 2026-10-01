-- A stale application version is an HTTP conflict, not a retryable database
-- serialization failure. Some hosted PostgREST versions retry SQLSTATE 40001.
-- Keep exact-command deduplication before this check and preserve all RLS/ACLs.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $preflight$
DECLARE target regprocedure; current_body text;
BEGIN
 target := to_regprocedure('public.fn_crm_record_outcome_v1(uuid,uuid,timestamptz,text,text,text,timestamptz,boolean)');
 IF target IS NULL THEN RAISE EXCEPTION 'CRM outcome baseline missing; apply workflow migration first'; END IF;
 SELECT prosrc INTO current_body FROM pg_proc WHERE oid=target;
 IF md5(current_body) NOT IN ('635f1a08b5a96a9fa3a43fd724231950','4e7ef7a6b1214d2f88e97b0d92ac4a01')
  OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=target AND NOT prosecdef AND provolatile='v'
    AND prorettype='public.leads'::regtype AND proconfig=ARRAY['search_path=pg_catalog']::text[]) THEN
  RAISE EXCEPTION 'CRM outcome baseline drift; review before changing conflict behavior';
 END IF;
END $preflight$;

CREATE OR REPLACE FUNCTION public.fn_crm_record_outcome_v1(p_lead_id uuid,p_request_id uuid,p_expected_updated_at timestamptz,
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
  RAISE EXCEPTION 'Lead changed. Refresh before recording this outcome.' USING ERRCODE='PT409'; END IF;
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
-- CREATE OR REPLACE preserves existing owner and execution privileges.
COMMIT;
