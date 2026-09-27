-- Candidate only: reuse unchanged parcel evidence across captures.
-- Only the envelope preparation ID may differ. Every parcel fact, source hash,
-- limitation and retrieval timestamp must remain equal. New facts need review.
-- Does not create review grants, acceptances or customer entitlements.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION snap_relaunch.source_mapping_evidence_matches_v1(p_mapping uuid,p_preparation text,p_evidence text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $body$
 SELECT EXISTS(
  SELECT 1 FROM snap_relaunch.customer_property_mappings m
  JOIN snap_relaunch.parcel_evidence old ON old.property_id=m.source_property_id
   AND old.preparation_sha256=m.preparation_sha256 AND old.evidence_sha256=m.source_evidence_sha256
  JOIN snap_relaunch.parcel_evidence fresh ON fresh.property_id=m.source_property_id
   AND fresh.preparation_sha256=p_preparation AND fresh.evidence_sha256=p_evidence
  WHERE m.id=p_mapping AND (
   old.evidence_sha256=fresh.evidence_sha256 OR (
    old.evidence_text::jsonb->>'version'='syracuse-parcel-identity-evidence-v1'
    AND old.evidence_text::jsonb->>'source_authority'='city-of-syracuse-ny'
    AND old.evidence_text::jsonb->>'preparation_sha256'=old.preparation_sha256
    AND fresh.evidence_text::jsonb->>'preparation_sha256'=fresh.preparation_sha256
    AND old.evidence_text::jsonb-'preparation_sha256'=fresh.evidence_text::jsonb-'preparation_sha256'
   )
  )
 );
$body$;
REVOKE ALL ON FUNCTION snap_relaunch.source_mapping_evidence_matches_v1(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.fn_accept_source_selection_v1(p_command_id uuid, p_review_id uuid, p_consumer_user_id uuid, p_purpose text, p_mapping_ids uuid[], p_resolutions jsonb, p_evidence_sha256 text, p_valid_until timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE actor uuid;review snap_relaunch.source_review_events%ROWTYPE;items jsonb;mapped jsonb;it jsonb;
 reasons jsonb;resolution jsonb;reason text;cmd text;prior snap_relaunch.customer_source_acceptances%ROWTYPE;BEGIN
 SELECT * INTO review FROM snap_relaunch.source_review_events WHERE id=p_review_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Source review unavailable' USING ERRCODE='42501';END IF;
 actor:=snap_relaunch.require_source_actor_v1(review.preparation_sha256,true);
 PERFORM pg_advisory_xact_lock(810207,71);
 cmd:=snap_relaunch.source_hash_v1(jsonb_build_array(actor,p_review_id,p_consumer_user_id,p_purpose,p_mapping_ids,p_resolutions,p_evidence_sha256,p_valid_until));
 SELECT * INTO prior FROM snap_relaunch.customer_source_acceptances WHERE id=p_command_id;
 IF FOUND THEN
  IF prior.command_sha256<>cmd THEN RAISE EXCEPTION 'Acceptance command conflicts' USING ERRCODE='22023';END IF;
  RETURN jsonb_build_object('acceptance_id',prior.id,'purpose',prior.purpose,'replayed',true);
 END IF;
 IF review.outcome<>'reviewed' OR review.id IS DISTINCT FROM (SELECT id FROM snap_relaunch.source_review_events
  WHERE preparation_sha256=review.preparation_sha256 AND selection_sha256=review.selection_sha256 ORDER BY created_at DESC,id DESC LIMIT 1) THEN
  RAISE EXCEPTION 'Current source review is not reviewed' USING ERRCODE='42501';END IF;
 IF NOT snap_relaunch.source_authorization_current_v1(review.preparation_sha256,review.reviewer_user_id,false) THEN
  RAISE EXCEPTION 'Original source reviewer authorization is unavailable' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users u JOIN public.profiles p ON p.user_id=u.id WHERE u.id=p_consumer_user_id
  AND u.deleted_at IS NULL AND NOT coalesce(u.is_anonymous,false) AND u.confirmed_at IS NOT NULL
  AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN
  RAISE EXCEPTION 'Exact consumer account unavailable' USING ERRCODE='42501';END IF;
 IF p_purpose NOT IN ('customer_export','crm') OR p_valid_until IS NULL OR p_valid_until<=clock_timestamp()
  OR p_valid_until>clock_timestamp()+interval '366 days' OR jsonb_typeof(p_resolutions) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'Explicit bounded consumer decision required' USING ERRCODE='22023';END IF;
 items:=snap_relaunch.source_manifest_v1(review.preparation_sha256,review.record_keys);
 IF snap_relaunch.source_hash_v1(items)<>review.selection_sha256 THEN RAISE EXCEPTION 'Source evidence changed' USING ERRCODE='22023';END IF;
 IF p_mapping_ids IS NULL OR cardinality(p_mapping_ids) NOT BETWEEN 1 AND 1000 OR array_position(p_mapping_ids,NULL) IS NOT NULL
  OR cardinality(p_mapping_ids)<>(SELECT count(DISTINCT id) FROM unnest(p_mapping_ids) id) THEN
  RAISE EXCEPTION 'Exact mapping set required' USING ERRCODE='22023';END IF;
 SELECT jsonb_agg(i.value||jsonb_build_object('mapping_id',m.id,'customer_property_id',m.customer_property_id,
  'mapping_revision',m.command_sha256) ORDER BY (i.value->>'source_row')::integer,i.value->>'record_key') INTO mapped
 FROM jsonb_array_elements(items) i JOIN snap_relaunch.customer_property_mappings m ON m.source_property_id=(i.value->>'source_property_id')::uuid
  AND m.id=ANY(p_mapping_ids)
  AND snap_relaunch.source_mapping_evidence_matches_v1(m.id,review.preparation_sha256,i.value->>'parcel_evidence_sha256')
 WHERE NOT EXISTS(SELECT 1 FROM snap_relaunch.source_revocations r WHERE r.kind='mapping' AND r.target_id=m.id)
  AND EXISTS(SELECT 1 FROM public.properties p WHERE p.id=m.customer_property_id
    AND snap_relaunch.source_hash_v1(to_jsonb(p))=m.target_snapshot_sha256);
 IF jsonb_array_length(mapped) IS DISTINCT FROM jsonb_array_length(items)
  OR cardinality(p_mapping_ids)<>(SELECT count(DISTINCT value->>'mapping_id') FROM jsonb_array_elements(mapped))
  OR cardinality(p_mapping_ids)<>(SELECT count(DISTINCT value->>'customer_property_id') FROM jsonb_array_elements(mapped)) THEN
  RAISE EXCEPTION 'Mapping set incomplete, revoked or ambiguous' USING ERRCODE='42501';END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(p_resolutions))<>jsonb_array_length(items) THEN RAISE EXCEPTION 'Exact per-record resolutions required' USING ERRCODE='22023';END IF;
 FOR it IN SELECT value FROM jsonb_array_elements(items) LOOP
  SELECT review_reasons INTO reasons FROM snap_relaunch.intake_events WHERE preparation_sha256=review.preparation_sha256 AND record_key=it->>'record_key';
  resolution:=p_resolutions->(it->>'record_key');
  IF jsonb_typeof(resolution) IS DISTINCT FROM 'array' OR jsonb_array_length(resolution)<>jsonb_array_length(reasons)
   OR (SELECT count(DISTINCT value->>'reason') FROM jsonb_array_elements(resolution))<>jsonb_array_length(reasons) THEN
   RAISE EXCEPTION 'Unresolved source review reasons' USING ERRCODE='22023';END IF;
  FOR reason IN SELECT jsonb_array_elements_text(reasons) LOOP
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(resolution) x WHERE x->>'reason'=reason
    AND x->>'disposition' IN ('verified','retained_limitation','deferred_to_request_authorization')
    AND x->>'evidence_sha256' ~ '^[0-9a-f]{64}$' AND length(x->>'note') BETWEEN 10 AND 2000
    AND (reason NOT IN ('confidentiality_not_provided','distribution_review_pending','current_private_original_proof_not_bound','customer_property_mapping_missing') OR x->>'disposition'='verified')
    AND (x->>'disposition'<>'deferred_to_request_authorization' OR reason='customer_entitlement_not_connected')) THEN
    RAISE EXCEPTION 'Source review resolution is incomplete' USING ERRCODE='22023';END IF;
  END LOOP;
 END LOOP;
 IF EXISTS(SELECT 1 FROM snap_relaunch.source_review_events r WHERE r.preparation_sha256=review.preparation_sha256
  AND r.outcome IN ('held','rejected') AND r.record_keys&&review.record_keys AND r.created_at>review.created_at) THEN
  RAISE EXCEPTION 'A later review holds selected records' USING ERRCODE='42501';END IF;
 INSERT INTO snap_relaunch.customer_source_acceptances(id,preparation_sha256,review_event_id,actor_user_id,consumer_user_id,consumer_org_id,purpose,
  scope,record_keys,selection_sha256,mapping_ids,mapped_items,resolutions,evidence_sha256,valid_until,command_sha256)
 VALUES(p_command_id,review.preparation_sha256,p_review_id,actor,p_consumer_user_id,(SELECT org_id FROM public.profiles WHERE user_id=p_consumer_user_id),p_purpose,'dated_parcel_source_snapshot',review.record_keys,
  review.selection_sha256,p_mapping_ids,mapped,p_resolutions,p_evidence_sha256,p_valid_until,cmd);
 RETURN jsonb_build_object('acceptance_id',p_command_id,'purpose',p_purpose,'consumer_user_id',p_consumer_user_id,
  'event_count',jsonb_array_length(mapped),'property_count',cardinality(p_mapping_ids),'replayed',false);
END $function$
;
CREATE OR REPLACE FUNCTION public.fn_owner_source_action_page_v1(p_preparation text, p_kind text, p_after jsonb DEFAULT NULL::jsonb, p_revision text DEFAULT NULL::text, p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET statement_timeout TO '10s'
AS $function$
DECLARE actor uuid;counts jsonb;revision text;entries jsonb;after_at timestamptz;after_id uuid;raw_count integer;kept integer;next_cursor jsonb;result jsonb;
BEGIN
 actor:=snap_relaunch.require_source_actor_v1(p_preparation,true);
 IF p_kind IS NULL OR p_kind NOT IN ('reviews','mappings','acceptances','revocations','crm_links') OR p_limit IS NULL OR p_limit<1 OR p_limit>100
  OR (p_revision IS NOT NULL AND p_revision!~'^[0-9a-f]{64}$') THEN RAISE EXCEPTION 'Invalid source page request' USING ERRCODE='22023';END IF;
 IF p_after IS NOT NULL AND p_after<>'null'::jsonb THEN
  IF jsonb_typeof(p_after) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid source page cursor' USING ERRCODE='22023';END IF;
  IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_after) k) IS DISTINCT FROM ARRAY['created_at','id']::text[]
   OR jsonb_typeof(p_after->'created_at') IS DISTINCT FROM 'string' OR jsonb_typeof(p_after->'id') IS DISTINCT FROM 'string'
   OR p_revision IS NULL THEN RAISE EXCEPTION 'Invalid source page cursor' USING ERRCODE='22023';END IF;
  after_at:=(p_after->>'created_at')::timestamptz;after_id:=(p_after->>'id')::uuid;
  IF after_at IS NULL OR after_id IS NULL OR NOT isfinite(after_at) THEN RAISE EXCEPTION 'Invalid source page cursor' USING ERRCODE='22023';END IF;
 END IF;
 SELECT jsonb_build_object(
  'reviews',(SELECT count(*) FROM snap_relaunch.source_review_events WHERE preparation_sha256=p_preparation),
  'mappings',(SELECT count(*) FROM snap_relaunch.customer_property_mappings m WHERE (m.preparation_sha256=p_preparation OR EXISTS(SELECT 1 FROM snap_relaunch.parcel_evidence pe WHERE pe.preparation_sha256=p_preparation AND pe.property_id=m.source_property_id AND snap_relaunch.source_mapping_evidence_matches_v1(m.id,p_preparation,pe.evidence_sha256)))),
  'acceptances',(SELECT count(*) FROM snap_relaunch.customer_source_acceptances WHERE preparation_sha256=p_preparation),
  'revocations',(SELECT count(*) FROM snap_relaunch.source_revocations WHERE preparation_sha256=p_preparation),
  'crm_links',(SELECT count(*) FROM snap_relaunch.source_crm_links l JOIN snap_relaunch.customer_source_acceptances a ON a.id=l.acceptance_id WHERE a.preparation_sha256=p_preparation)) INTO counts;

 -- Every decision table is append-only. Counts bind an immutable history set:
 -- an append changes this revision, so pages from different sets cannot merge.
 -- Current-role/expiry flags are observations at each page read. Every action
 -- still rechecks current authorization; this is not an entitlement snapshot.
 revision:=snap_relaunch.source_hash_v1(jsonb_build_object('preparation_sha256',p_preparation,'actor_user_id',actor,'counts',counts,'mapping_revocations',(SELECT count(*) FROM snap_relaunch.source_revocations r JOIN snap_relaunch.customer_property_mappings m ON r.kind='mapping' AND r.target_id=m.id WHERE (m.preparation_sha256=p_preparation OR EXISTS(SELECT 1 FROM snap_relaunch.parcel_evidence pe WHERE pe.preparation_sha256=p_preparation AND pe.property_id=m.source_property_id AND snap_relaunch.source_mapping_evidence_matches_v1(m.id,p_preparation,pe.evidence_sha256))))));
 IF p_revision IS NOT NULL AND p_revision<>revision THEN RAISE EXCEPTION 'Source history changed during paging; refresh' USING ERRCODE='40001';END IF;
 IF p_kind='reviews' THEN
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.id DESC),'[]') INTO entries FROM (
  SELECT r.id,r.record_keys,r.selection_sha256,r.reviewer_user_id,r.outcome,r.note,r.evidence_sha256,r.created_at,
   NOT EXISTS(SELECT 1 FROM snap_relaunch.source_review_events newer WHERE newer.preparation_sha256=r.preparation_sha256 AND newer.selection_sha256=r.selection_sha256 AND (newer.created_at,newer.id)>(r.created_at,r.id)) AS current
  FROM snap_relaunch.source_review_events r WHERE r.preparation_sha256=p_preparation AND (after_id IS NULL OR (r.created_at,r.id)<(after_at,after_id)) ORDER BY r.created_at DESC,r.id DESC LIMIT p_limit) x;
 ELSIF p_kind='mappings' THEN
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.id DESC),'[]') INTO entries FROM (
  SELECT m.id,m.source_property_id,m.customer_property_id,m.source_evidence_sha256,m.target_snapshot_sha256,m.created_for_source,m.created_at,
   (SELECT pe.evidence_sha256 FROM snap_relaunch.parcel_evidence pe WHERE pe.property_id=m.source_property_id AND pe.preparation_sha256=p_preparation ORDER BY pe.source_retrieved_at DESC,pe.evidence_sha256 LIMIT 1) AS current_source_evidence_sha256,
   ip.source_address,p.address target_address,
   EXISTS(SELECT 1 FROM snap_relaunch.source_revocations WHERE kind='mapping' AND target_id=m.id) revoked,
   NOT EXISTS(SELECT 1 FROM snap_relaunch.source_revocations WHERE kind='mapping' AND target_id=m.id)
    AND snap_relaunch.source_hash_v1(to_jsonb(p))=m.target_snapshot_sha256
    AND snap_relaunch.source_mapping_evidence_matches_v1(m.id,p_preparation,(SELECT pe.evidence_sha256 FROM snap_relaunch.parcel_evidence pe
      WHERE pe.property_id=m.source_property_id AND pe.preparation_sha256=p_preparation ORDER BY pe.source_retrieved_at DESC,pe.evidence_sha256 LIMIT 1)) AS current
  FROM snap_relaunch.customer_property_mappings m JOIN public.properties p ON p.id=m.customer_property_id
  JOIN snap_relaunch.property_identities i ON i.property_id=m.source_property_id
  LEFT JOIN snap_relaunch.intake_parcels ip ON ip.preparation_sha256=p_preparation AND ip.source_parcel_reference=i.source_parcel_reference
  WHERE (m.preparation_sha256=p_preparation OR EXISTS(SELECT 1 FROM snap_relaunch.parcel_evidence pe WHERE pe.preparation_sha256=p_preparation AND pe.property_id=m.source_property_id AND snap_relaunch.source_mapping_evidence_matches_v1(m.id,p_preparation,pe.evidence_sha256))) AND (after_id IS NULL OR (m.created_at,m.id)<(after_at,after_id)) ORDER BY m.created_at DESC,m.id DESC LIMIT p_limit) x;
 ELSIF p_kind='acceptances' THEN
 SELECT coalesce(jsonb_agg(x.payload ORDER BY x.created_at DESC,x.id DESC),'[]') INTO entries FROM (
  SELECT a.id,a.created_at,jsonb_build_object('id',a.id,'review_event_id',a.review_event_id,'actor_user_id',a.actor_user_id,
   'consumer_user_id',a.consumer_user_id,'consumer_org_id',a.consumer_org_id,
   'consumer_label',coalesce(nullif(p.full_name,''),nullif(p.email,''),a.consumer_user_id::text),
   'purpose',a.purpose,'scope',a.scope,'record_keys',a.record_keys,'selection_sha256',a.selection_sha256,
   'mapping_ids',a.mapping_ids,'valid_until',a.valid_until,'created_at',a.created_at,'resolutions_available',true)
    ||snap_relaunch.owner_source_acceptance_status_v1(p_preparation,a.id) payload
  FROM snap_relaunch.customer_source_acceptances a LEFT JOIN public.profiles p ON p.user_id=a.consumer_user_id
  WHERE a.preparation_sha256=p_preparation AND (after_id IS NULL OR (a.created_at,a.id)<(after_at,after_id)) ORDER BY a.created_at DESC,a.id DESC LIMIT p_limit) x;
 ELSIF p_kind='revocations' THEN
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.id DESC),'[]') INTO entries FROM (
  SELECT id,kind,target_id,actor_user_id,evidence_sha256,note,created_at FROM snap_relaunch.source_revocations
  WHERE preparation_sha256=p_preparation AND (after_id IS NULL OR (created_at,id)<(after_at,after_id)) ORDER BY created_at DESC,id DESC LIMIT p_limit) x;
 ELSIF p_kind='crm_links' THEN
 SELECT coalesce(jsonb_agg(x.payload ORDER BY x.created_at DESC,x.id DESC),'[]') INTO entries FROM (
  SELECT l.id,l.created_at,jsonb_build_object('id',l.id,'acceptance_id',l.acceptance_id,'source_property_id',l.source_property_id,
   'customer_property_id',l.customer_property_id,'consumer_user_id',l.consumer_user_id,'org_id',l.org_id,
   'lead_id',l.lead_id,'activity_id',l.activity_id,'created_at',l.created_at)
    ||snap_relaunch.owner_source_acceptance_status_v1(p_preparation,l.acceptance_id) payload
  FROM snap_relaunch.source_crm_links l JOIN snap_relaunch.customer_source_acceptances a ON a.id=l.acceptance_id
  WHERE a.preparation_sha256=p_preparation AND (after_id IS NULL OR (l.created_at,l.id)<(after_at,after_id)) ORDER BY l.created_at DESC,l.id DESC LIMIT p_limit) x;
 END IF;

 raw_count:=jsonb_array_length(entries);
 -- Keep each response under 1 MiB without discarding the remaining cursor.
 SELECT coalesce(jsonb_agg(value ORDER BY ord),'[]'::jsonb) INTO entries FROM (
  SELECT value,ord,sum(octet_length(value::text)+1) OVER(ORDER BY ord) AS used FROM jsonb_array_elements(entries) WITH ORDINALITY e(value,ord)
 ) bounded WHERE used<=1040000;
 kept:=jsonb_array_length(entries);
 IF raw_count>0 AND kept=0 THEN RAISE EXCEPTION 'One source history row exceeds the page limit' USING ERRCODE='54000';END IF;
 IF kept>0 AND (raw_count=p_limit OR kept<raw_count) THEN
  next_cursor:=jsonb_build_object('created_at',entries->(kept-1)->>'created_at','id',entries->(kept-1)->>'id');
 END IF;
 result:=jsonb_build_object('version','owner-source-action-page-v1','preparation_sha256',p_preparation,'actor_user_id',actor,
  'checked_at',clock_timestamp(),'can_administer',true,'kind',p_kind,'revision',revision,'counts',counts,'rows',entries,'next_cursor',next_cursor,
  'current_flags_scope','Observed at each page read; execution rechecks current authorization.');
 IF octet_length(result::text)>1048576 THEN RAISE EXCEPTION 'Source history page exceeds byte limit' USING ERRCODE='54000';END IF;
 RETURN result;
END $function$
;
REVOKE ALL ON FUNCTION public.fn_owner_source_action_page_v1(text,text,jsonb,text,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_owner_source_action_page_v1(text,text,jsonb,text,integer) TO authenticated;
COMMIT;
