-- Additive follow-up to PR182: preserve v1 and all decision/history tables.
SET LOCAL lock_timeout='5s';
DO $guard$ BEGIN
 IF to_regprocedure('public.fn_owner_source_action_page_v1(text,text,jsonb,text,integer)') IS NOT NULL THEN RAISE EXCEPTION 'Source history pagination already installed';END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.fn_owner_source_action_state_v1(text)'))) IS DISTINCT FROM '2e29c4ada4642f93aba90e95a40d1f2a'
 THEN RAISE EXCEPTION 'PR182 source state baseline drift';END IF;
 IF to_regprocedure('snap_relaunch.require_source_actor_v1(text,boolean)') IS NULL OR to_regprocedure('snap_relaunch.owner_source_acceptance_status_v1(text,uuid)') IS NULL
 THEN RAISE EXCEPTION 'PR182 owner source authorization missing';END IF;
END $guard$;
CREATE FUNCTION public.fn_owner_source_action_page_v1(p_preparation text,p_kind text,p_after jsonb DEFAULT NULL,p_revision text DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog SET statement_timeout='10s' AS $$
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
  'mappings',(SELECT count(*) FROM snap_relaunch.customer_property_mappings WHERE preparation_sha256=p_preparation),
  'acceptances',(SELECT count(*) FROM snap_relaunch.customer_source_acceptances WHERE preparation_sha256=p_preparation),
  'revocations',(SELECT count(*) FROM snap_relaunch.source_revocations WHERE preparation_sha256=p_preparation),
  'crm_links',(SELECT count(*) FROM snap_relaunch.source_crm_links l JOIN snap_relaunch.customer_source_acceptances a ON a.id=l.acceptance_id WHERE a.preparation_sha256=p_preparation)) INTO counts;

 -- Every decision table is append-only. Counts bind an immutable history set:
 -- an append changes this revision, so pages from different sets cannot merge.
 -- Current-role/expiry flags are observations at each page read. Every action
 -- still rechecks current authorization; this is not an entitlement snapshot.
 revision:=snap_relaunch.source_hash_v1(jsonb_build_object('preparation_sha256',p_preparation,'actor_user_id',actor,'counts',counts));
 IF p_revision IS NOT NULL AND p_revision<>revision THEN RAISE EXCEPTION 'Source history changed during paging; refresh' USING ERRCODE='40001';END IF;
 IF p_kind='reviews' THEN
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.id DESC),'[]') INTO entries FROM (
  SELECT r.id,r.record_keys,r.selection_sha256,r.reviewer_user_id,r.outcome,r.note,r.evidence_sha256,r.created_at,
   NOT EXISTS(SELECT 1 FROM snap_relaunch.source_review_events newer WHERE newer.preparation_sha256=r.preparation_sha256 AND newer.selection_sha256=r.selection_sha256 AND (newer.created_at,newer.id)>(r.created_at,r.id)) AS current
  FROM snap_relaunch.source_review_events r WHERE r.preparation_sha256=p_preparation AND (after_id IS NULL OR (r.created_at,r.id)<(after_at,after_id)) ORDER BY r.created_at DESC,r.id DESC LIMIT p_limit) x;
 ELSIF p_kind='mappings' THEN
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.id DESC),'[]') INTO entries FROM (
  SELECT m.id,m.source_property_id,m.customer_property_id,m.source_evidence_sha256,m.target_snapshot_sha256,m.created_for_source,m.created_at,
   ip.source_address,p.address target_address,
   EXISTS(SELECT 1 FROM snap_relaunch.source_revocations WHERE kind='mapping' AND target_id=m.id) revoked,
   NOT EXISTS(SELECT 1 FROM snap_relaunch.source_revocations WHERE kind='mapping' AND target_id=m.id)
    AND snap_relaunch.source_hash_v1(to_jsonb(p))=m.target_snapshot_sha256
    AND m.source_evidence_sha256=(SELECT pe.evidence_sha256 FROM snap_relaunch.parcel_evidence pe
      WHERE pe.property_id=m.source_property_id AND pe.preparation_sha256=m.preparation_sha256 ORDER BY pe.source_retrieved_at DESC,pe.evidence_sha256 LIMIT 1) AS current
  FROM snap_relaunch.customer_property_mappings m JOIN public.properties p ON p.id=m.customer_property_id
  JOIN snap_relaunch.property_identities i ON i.property_id=m.source_property_id
  LEFT JOIN snap_relaunch.intake_parcels ip ON ip.preparation_sha256=m.preparation_sha256 AND ip.source_parcel_reference=i.source_parcel_reference
  WHERE m.preparation_sha256=p_preparation AND (after_id IS NULL OR (m.created_at,m.id)<(after_at,after_id)) ORDER BY m.created_at DESC,m.id DESC LIMIT p_limit) x;
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
END $$;
REVOKE ALL ON FUNCTION public.fn_owner_source_action_page_v1(text,text,jsonb,text,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_owner_source_action_page_v1(text,text,jsonb,text,integer) TO authenticated;