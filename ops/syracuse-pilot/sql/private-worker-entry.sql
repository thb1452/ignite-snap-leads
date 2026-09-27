-- Narrow private worker entry. No customer release or role changes.
BEGIN;
CREATE TABLE snap_relaunch.syracuse_private_handoff_policy_v1 (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT false,
 instruction_ref text NOT NULL,
 valid_until timestamptz NOT NULL
);
ALTER TABLE snap_relaunch.syracuse_private_handoff_policy_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON snap_relaunch.syracuse_private_handoff_policy_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.fn_import_syracuse_private_v1(p_envelope_text text,p_envelope_sha256 text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE secret text; base snap_relaunch.receipt_processing_policy_v1%ROWTYPE;
BEGIN
 -- Reuse the already installed worker credential without disclosing it or
 -- giving a public key alone any authority. The Syracuse policy is independent.
 secret:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb)->>'x-snap-receipt-token';
 SELECT * INTO base FROM snap_relaunch.receipt_processing_policy_v1 WHERE policy_id='existing-code-receipts-20260923-v1' FOR SHARE;
 IF NOT FOUND OR NOT base.enabled OR base.mode<>'automatic' OR secret IS NULL OR secret !~ '^[0-9a-f]{64}$'
  OR encode(sha256(convert_to(secret,'UTF8')),'hex') IS DISTINCT FROM base.token_sha256
  OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=base.owner_user_id AND deleted_at IS NULL AND NOT coalesce(is_anonymous,false)
    AND confirmed_at IS NOT NULL AND (banned_until IS NULL OR banned_until<=statement_timestamp()))
  OR NOT EXISTS(SELECT 1 FROM snap_relaunch.syracuse_private_handoff_policy_v1 WHERE singleton AND enabled AND valid_until>statement_timestamp()) THEN
  RAISE EXCEPTION 'Private Syracuse import not authorized' USING ERRCODE='42501'; END IF;
 secret:=NULL;
 RETURN snap_relaunch.stage_clean_syracuse_v1(p_envelope_text,p_envelope_sha256);
END $$;
REVOKE ALL ON FUNCTION public.fn_import_syracuse_private_v1(text,text) FROM PUBLIC,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_import_syracuse_private_v1(text,text) TO anon;
COMMIT;
