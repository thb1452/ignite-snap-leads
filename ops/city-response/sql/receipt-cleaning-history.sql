-- Append cleaning/import evidence to existing received-file jobs. Original
-- source jobs, observations, archives, request receipts and histories stay intact.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TABLE public.collection_receipt_cleaning_v1 (
 receipt_id uuid NOT NULL,
 adapter_version text NOT NULL,
 source_job_id uuid NOT NULL REFERENCES public.collection_receipt_jobs(id),
 observation_sha256 text NOT NULL,
 request_id uuid NOT NULL REFERENCES public.foia_request_jobs(id),
 agency_key text NOT NULL,
 original_sha256 text NOT NULL CHECK(original_sha256 ~ '^[0-9a-f]{64}$'),
 report_text text NOT NULL CHECK(octet_length(report_text)<=4000000),
 report_sha256 text NOT NULL CHECK(report_sha256 ~ '^[0-9a-f]{64}$'),
 report jsonb NOT NULL,
 import_payload_text text,
 import_payload_sha256 text,
 import_result jsonb,
 state text NOT NULL CHECK(state IN ('needs_review','ready_to_import','import_unconfirmed','imported')),
 error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(receipt_id,adapter_version),
 CHECK(encode(sha256(convert_to(report_text,'UTF8')),'hex')=report_sha256 AND report_text::jsonb=report),
 CHECK((import_payload_text IS NULL AND import_payload_sha256 IS NULL) OR
  (import_payload_text IS NOT NULL AND import_payload_sha256 IS NOT NULL AND octet_length(import_payload_text)<=4000000
   AND encode(sha256(convert_to(import_payload_text,'UTF8')),'hex')=import_payload_sha256)),
 CHECK((state='needs_review' AND import_payload_text IS NULL) OR (state<>'needs_review' AND import_payload_text IS NOT NULL))
);
ALTER TABLE public.collection_receipt_cleaning_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.collection_receipt_cleaning_v1 FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.collection_receipt_cleaning_v1 TO service_role;

CREATE FUNCTION public.city_receipt_save_cleaning_v1(p_context jsonb,p_report_text text,p_import_payload_text text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE
 o public.collection_receipt_observations%ROWTYPE;
 j public.collection_receipt_jobs%ROWTYPE;
 saved public.collection_receipt_cleaning_v1%ROWTYPE;
 report jsonb; payload jsonb; report_pin text; payload_pin text;
 v_request_id uuid; attempted uuid; outlet uuid; v_receipt_id uuid; rule text;
BEGIN
 IF octet_length(p_report_text)>4000000 OR p_report_text IS NULL OR (p_import_payload_text IS NOT NULL AND octet_length(p_import_payload_text)>4000000) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid cleaning report size';
 END IF;
 report:=p_report_text::jsonb; payload:=p_import_payload_text::jsonb;
 report_pin:=encode(sha256(convert_to(p_report_text,'UTF8')),'hex');
 payload_pin:=CASE WHEN p_import_payload_text IS NULL THEN NULL ELSE encode(sha256(convert_to(p_import_payload_text,'UTF8')),'hex') END;
 v_receipt_id:=(p_context->>'receipt_id')::uuid;v_request_id:=(p_context->>'request_id')::uuid;
 attempted:=(p_context->>'submission_attempt_id')::uuid;outlet:=(p_context->>'outlet_id')::uuid;
 rule:=report->>'adapter_version';
 IF v_receipt_id IS NULL OR v_request_id IS NULL OR attempted IS NULL OR outlet IS NULL
  OR report->>'version' IS DISTINCT FROM 'record-privacy-v1' OR rule IS DISTINCT FROM 'madison-heights-enforcement-list-v1'
  OR p_context->>'agency_key' IS DISTINCT FROM 'us:mi:madisonheights'
  OR jsonb_typeof(report->'records') IS DISTINCT FROM 'array'
  OR (report->>'input_records')::integer IS DISTINCT FROM jsonb_array_length(report->'records')
  OR (report->>'input_records')::integer IS DISTINCT FROM (report->>'passed_records')::integer+(report->>'held_records')::integer
  OR (report->>'input_records')::integer NOT BETWEEN 0 AND 2000
  OR ((report->>'input_records')::integer=0 AND (report->>'file_review_reason' IS DISTINCT FROM 'source_layout_or_row_accounting_requires_review' OR report->>'count_status' IS DISTINCT FROM 'not_extracted'))
  OR coalesce((report->>'passed_records')::integer,-1)<0 OR coalesce((report->>'held_records')::integer,-1)<0
  OR (SELECT count(*) FROM jsonb_array_elements(report->'records') r WHERE r->>'accuracy_status'='passed') IS DISTINCT FROM (report->>'passed_records')::bigint THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Cleaning report contract mismatch';
 END IF;
 PERFORM pg_advisory_xact_lock(810209,hashtext(v_receipt_id::text));
 SELECT * INTO STRICT j FROM public.collection_receipt_jobs WHERE id=(p_context->>'source_job_id')::uuid FOR UPDATE;
 SELECT * INTO STRICT o FROM public.collection_receipt_observations obs WHERE obs.receipt_id=j.receipt_id AND obs.observation_sha256=j.observation_sha256;
 IF o.receipt_id<>v_receipt_id OR o.scope<>'unverified_incoming' OR o.original_sha256 IS DISTINCT FROM report->>'original_sha256'
  OR o.observation_sha256 IS DISTINCT FROM p_context->>'observation_sha256'
  OR public.receipt_current_revision(o.inbox_id,o.message_id) IS DISTINCT FROM jsonb_build_object('message_digest',o.message_digest,'link_revision',o.link_revision)
  OR public.receipt_request_binding(v_request_id,attempted,NULL,outlet,o.inbox_id,p_context->>'agency_key') IS DISTINCT FROM true
  OR NOT EXISTS(SELECT 1 FROM public.mailbox_processing_results m WHERE m.inbox_id=o.inbox_id AND m.message_id=o.message_id
    AND m.request_job_id=v_request_id AND m.match_state='matched' AND m.input_digest=o.message_digest AND m.link_revision=o.link_revision
    AND m.result->'city_response'->>'document_action'='preserve_and_process') THEN
  RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Original request or received-file evidence changed';
 END IF;
 IF (report->>'passed_records')::integer>0 THEN
  IF payload IS NULL OR payload->>'version' IS DISTINCT FROM 'cleaned-receipt-import-v1'
   OR payload->>'receipt_id' IS DISTINCT FROM v_receipt_id::text OR payload->>'request_id' IS DISTINCT FROM v_request_id::text
   OR payload->>'source_job_id' IS DISTINCT FROM j.id::text OR payload->>'original_sha256' IS DISTINCT FROM o.original_sha256
   OR payload->>'archive_id' IS DISTINCT FROM o.archive_id::text OR payload->>'archive_manifest_sha256' IS DISTINCT FROM o.archive_manifest_sha256
   OR payload->'archive_verified' IS DISTINCT FROM 'true'::jsonb OR payload->>'agency_key' IS DISTINCT FROM p_context->>'agency_key'
   OR payload->>'adapter_version' IS DISTINCT FROM rule OR payload->>'policy_id' IS DISTINCT FROM 'existing-code-receipts-20260923-v1'
   OR payload->>'passing_count' IS DISTINCT FROM report->>'passed_records'
   OR payload->>'input_count' IS DISTINCT FROM report->>'input_records' THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Import envelope does not match saved cleaning evidence';
  END IF;
 ELSE
  IF payload IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Held records cannot create an import'; END IF;
 END IF;
 SELECT * INTO saved FROM public.collection_receipt_cleaning_v1 c WHERE c.receipt_id=v_receipt_id AND c.adapter_version=rule;
 IF FOUND THEN
  -- A newer mailbox classification can create another observation of the same
  -- original. Reuse the first saved import envelope; never rebind its receipt.
  IF saved.report_sha256<>report_pin OR saved.request_id<>v_request_id OR saved.original_sha256<>o.original_sha256 THEN
   RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Saved cleaning evidence differs';
  END IF;
 ELSE
  INSERT INTO public.collection_receipt_cleaning_v1(receipt_id,adapter_version,source_job_id,observation_sha256,request_id,agency_key,
   original_sha256,report_text,report_sha256,report,import_payload_text,import_payload_sha256,state)
  VALUES(v_receipt_id,rule,j.id,o.observation_sha256,v_request_id,p_context->>'agency_key',o.original_sha256,p_report_text,report_pin,report,
   p_import_payload_text,payload_pin,CASE WHEN p_import_payload_text IS NULL THEN 'needs_review' ELSE 'ready_to_import' END)
  RETURNING * INTO saved;
 END IF;
 RETURN jsonb_build_object('receipt_id',saved.receipt_id,'adapter_version',saved.adapter_version,'report_sha256',saved.report_sha256,
  'state',saved.state,'import_payload_text',saved.import_payload_text,'import_payload_sha256',saved.import_payload_sha256,'import_result',saved.import_result);
END
$fn$;
REVOKE ALL ON FUNCTION public.city_receipt_save_cleaning_v1(jsonb,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.city_receipt_save_cleaning_v1(jsonb,text,text) TO service_role;

CREATE FUNCTION public.city_receipt_finish_cleaning_v1(p_receipt uuid,p_adapter text,p_payload_sha256 text,p_result jsonb,p_error_code text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE saved public.collection_receipt_cleaning_v1%ROWTYPE; n integer;
BEGIN
 SELECT * INTO STRICT saved FROM public.collection_receipt_cleaning_v1 WHERE receipt_id=p_receipt AND adapter_version=p_adapter FOR UPDATE;
 IF saved.import_payload_sha256 IS DISTINCT FROM p_payload_sha256 OR saved.import_payload_text IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Saved import envelope mismatch';
 END IF;
 IF p_result IS NULL THEN
  IF p_error_code IS NULL OR p_error_code NOT IN ('private_snap_import_unconfirmed','import_configuration_unavailable','import_receipt_unconfirmed') THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Unsupported import error code';
  END IF;
  IF saved.import_result IS NULL THEN
   UPDATE public.collection_receipt_cleaning_v1 SET state='import_unconfirmed',error_code=p_error_code,updated_at=now() WHERE receipt_id=p_receipt AND adapter_version=p_adapter;
  END IF;
 ELSE
  n:=(saved.report->>'passed_records')::integer;
  IF p_result->>'version' IS DISTINCT FROM 'cleaned-receipt-import-v1' OR p_result->>'status' IS NULL OR p_result->>'status' NOT IN ('imported','replayed')
   OR p_result->>'receipt_id' IS DISTINCT FROM p_receipt::text OR p_result->>'payload_sha256' IS DISTINCT FROM p_payload_sha256
   OR p_result->>'input_count' IS DISTINCT FROM saved.report->>'input_records' OR (p_result->>'passing_count')::integer IS DISTINCT FROM n
   OR p_result->'provider_calls' IS DISTINCT FROM '0'::jsonb OR jsonb_typeof(p_result->'items') IS DISTINCT FROM 'array'
   OR jsonb_array_length(p_result->'items')<>n
   OR coalesce((p_result->>'imported')::integer,-1)<0 OR coalesce((p_result->>'reused')::integer,-1)<0 OR coalesce((p_result->>'held')::integer,-1)<0
   OR (SELECT count(*) FROM jsonb_array_elements(p_result->'items') i WHERE i->>'status'='needs_review') IS DISTINCT FROM (p_result->>'held')::bigint
   OR (p_result->>'imported')::integer+(p_result->>'reused')::integer+(p_result->>'held')::integer IS DISTINCT FROM n
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_result->'items') i WHERE i->>'status' IS NULL OR i->>'status' NOT IN ('insight_ready','needs_review'))
   OR (SELECT array_agg(i->>'record_key' ORDER BY i->>'record_key') FROM jsonb_array_elements(p_result->'items') i) IS DISTINCT FROM
      (SELECT array_agg(r->>'record_key' ORDER BY r->>'record_key') FROM jsonb_array_elements(saved.report->'records') r WHERE r->>'accuracy_status'='passed') THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Private Snap import receipt is incomplete';
  END IF;
  IF saved.import_result IS NOT NULL AND saved.import_result-'status' IS DISTINCT FROM p_result-'status' THEN
   RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Private Snap import receipt changed';
  END IF;
  UPDATE public.collection_receipt_cleaning_v1 SET state='imported',import_result=coalesce(import_result,p_result),error_code=NULL,updated_at=now()
   WHERE receipt_id=p_receipt AND adapter_version=p_adapter;
 END IF;
 RETURN jsonb_build_object('receipt_id',p_receipt,'state',(SELECT c.state FROM public.collection_receipt_cleaning_v1 c WHERE c.receipt_id=p_receipt AND c.adapter_version=p_adapter));
END
$fn$;
REVOKE ALL ON FUNCTION public.city_receipt_finish_cleaning_v1(uuid,text,text,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.city_receipt_finish_cleaning_v1(uuid,text,text,jsonb,text) TO service_role;
CREATE FUNCTION public.city_receipt_defer_cleaning_v1(p_job uuid,p_observation text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
BEGIN
 UPDATE public.collection_receipt_jobs j SET reason='receipt_preservation_or_binding_unconfirmed',attempts=least(3,coalesce(attempts,0)+1),
  next_attempt_at=now()+CASE WHEN coalesce(attempts,0)>=3 THEN interval '1 day' ELSE interval '1 hour' END
 WHERE j.id=p_job AND j.observation_sha256=p_observation AND j.source_contract_id IS NULL AND j.status='needs_review'
 AND EXISTS(SELECT 1 FROM public.collection_receipt_observations o JOIN public.mailbox_processing_results m
  ON m.inbox_id=o.inbox_id AND m.message_id=o.message_id JOIN public.foia_preparations p ON p.id=m.request_job_id
  WHERE o.receipt_id=j.receipt_id AND o.observation_sha256=j.observation_sha256 AND o.scope='unverified_incoming'
   AND p.agency_key='us:mi:madisonheights' AND p.record_type='code_violations');
 RETURN FOUND;
END
$fn$;
REVOKE ALL ON FUNCTION public.city_receipt_defer_cleaning_v1(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.city_receipt_defer_cleaning_v1(uuid,text) TO service_role;
COMMIT;
