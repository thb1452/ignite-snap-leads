-- Candidate only: retain every existing acceptance, mapping, revocation, organization and authority check.
-- Remove the unrelated administrator-role gate for the exact accepted consumer.
BEGIN;
SET LOCAL lock_timeout='3s';
CREATE OR REPLACE FUNCTION snap_relaunch.require_source_acceptance_v1(p_acceptance uuid, p_purpose text)
 RETURNS snap_relaunch.customer_source_acceptances
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE a snap_relaunch.customer_source_acceptances%ROWTYPE;BEGIN
 IF auth.uid() IS NULL THEN
  RAISE EXCEPTION 'Customer access remains held' USING ERRCODE='42501';END IF;
 SELECT * INTO a FROM snap_relaunch.customer_source_acceptances WHERE id=p_acceptance AND consumer_user_id=auth.uid() AND purpose=p_purpose;
 IF NOT FOUND OR a.valid_until<=clock_timestamp() OR EXISTS(SELECT 1 FROM snap_relaunch.source_revocations r WHERE r.kind='acceptance' AND r.target_id=a.id)
  OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND org_id=a.consumer_org_id)
  OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid() AND deleted_at IS NULL AND confirmed_at IS NOT NULL
    AND NOT coalesce(is_anonymous,false) AND (banned_until IS NULL OR banned_until<=now()))
  OR EXISTS(SELECT 1 FROM snap_relaunch.source_revocations r WHERE r.kind='mapping' AND r.target_id=ANY(a.mapping_ids))
  OR EXISTS(SELECT 1 FROM snap_relaunch.customer_property_mappings m JOIN public.properties p ON p.id=m.customer_property_id
    WHERE m.id=ANY(a.mapping_ids) AND snap_relaunch.source_hash_v1(to_jsonb(p))<>m.target_snapshot_sha256)
  OR EXISTS(SELECT 1 FROM snap_relaunch.source_review_events r WHERE r.preparation_sha256=a.preparation_sha256
    AND r.outcome IN ('held','rejected') AND r.record_keys&&a.record_keys AND r.created_at>a.created_at)
  OR NOT snap_relaunch.source_accepting_authority_current_v1(a.id)
  OR NOT snap_relaunch.source_authorization_current_v1(a.preparation_sha256,a.actor_user_id,true)
  OR NOT snap_relaunch.source_authorization_current_v1(a.preparation_sha256,
    (SELECT reviewer_user_id FROM snap_relaunch.source_review_events WHERE id=a.review_event_id),false)
  OR a.review_event_id IS DISTINCT FROM (SELECT id FROM snap_relaunch.source_review_events WHERE preparation_sha256=a.preparation_sha256
    AND selection_sha256=a.selection_sha256 ORDER BY created_at DESC,id DESC LIMIT 1) THEN
  RAISE EXCEPTION 'Current source acceptance unavailable' USING ERRCODE='42501';END IF;
 IF snap_relaunch.source_hash_v1(snap_relaunch.source_manifest_v1(a.preparation_sha256,a.record_keys))<>a.selection_sha256 THEN
  RAISE EXCEPTION 'Accepted source evidence changed' USING ERRCODE='42501';END IF;
 RETURN a;
END $function$;
COMMIT;
