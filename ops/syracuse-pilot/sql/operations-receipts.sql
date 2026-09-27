-- Additive private receipt ledger in the OPERATIONS database, not customer DB.
-- A received intake is not customer acceptance. These facts are kept separate.
BEGIN;
SET LOCAL lock_timeout='3s';
CREATE TABLE public.collection_customer_intake_receipts_v1 (
 preparation_sha256 text PRIMARY KEY CHECK(preparation_sha256 ~ '^[0-9a-f]{64}$'),
 delivery_id uuid NOT NULL REFERENCES public.collection_deliveries(id),
 processing_run_id uuid NOT NULL REFERENCES public.collection_processing_runs(id),
 payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'),
 event_count integer NOT NULL CHECK(event_count BETWEEN 1 AND 2000),
 parcel_count integer NOT NULL CHECK(parcel_count BETWEEN 1 AND 2000),
 receipt jsonb NOT NULL CHECK(receipt->>'customer_accepted'='false'),
 linked_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.collection_customer_intake_receipts_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.collection_customer_intake_receipts_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.reject_customer_intake_receipt_mutation_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Customer intake receipts are immutable' USING ERRCODE='55000'; END $$;
REVOKE ALL ON FUNCTION public.reject_customer_intake_receipt_mutation_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER customer_intake_receipts_append_only BEFORE UPDATE OR DELETE OR TRUNCATE
ON public.collection_customer_intake_receipts_v1 FOR EACH STATEMENT
EXECUTE FUNCTION public.reject_customer_intake_receipt_mutation_v1();
CREATE FUNCTION public.fn_link_customer_intake_receipt_v1(p_receipt jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE prior public.collection_customer_intake_receipts_v1%ROWTYPE; run public.collection_processing_runs%ROWTYPE;
BEGIN
 IF p_receipt->>'version' IS DISTINCT FROM 'syracuse-private-handoff-v1'
  OR coalesce(p_receipt->>'status','') NOT IN ('staged','replayed') OR p_receipt->'customer_accepted' IS DISTINCT FROM 'false'::jsonb
  OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_receipt) k) IS DISTINCT FROM
   ARRAY['customer_accepted','delivery_id','events','parcels','payload_sha256','preparation_sha256','processing_run_id','status','version']::text[] THEN
  RAISE EXCEPTION 'Invalid customer intake receipt' USING ERRCODE='22023'; END IF;
 SELECT * INTO STRICT run FROM public.collection_processing_runs WHERE id=(p_receipt->>'processing_run_id')::uuid;
 IF run.delivery_id IS DISTINCT FROM (p_receipt->>'delivery_id')::uuid
  OR (p_receipt->>'events')::integer>run.candidate_rows THEN
  RAISE EXCEPTION 'Receipt does not match collection' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_receipt->>'preparation_sha256',0));
 SELECT * INTO prior FROM public.collection_customer_intake_receipts_v1 WHERE preparation_sha256=p_receipt->>'preparation_sha256';
 IF FOUND THEN
  -- Replayed describes transport, not different receipt identity.
  IF prior.receipt-'status' IS DISTINCT FROM p_receipt-'status' THEN
   RAISE EXCEPTION 'Customer intake receipt conflicts' USING ERRCODE='22023'; END IF;
  RETURN p_receipt;
 END IF;
 INSERT INTO public.collection_customer_intake_receipts_v1 VALUES(p_receipt->>'preparation_sha256',
  (p_receipt->>'delivery_id')::uuid,(p_receipt->>'processing_run_id')::uuid,p_receipt->>'payload_sha256',
  (p_receipt->>'events')::integer,(p_receipt->>'parcels')::integer,p_receipt,clock_timestamp());
 RETURN p_receipt;
END $$;
REVOKE ALL ON FUNCTION public.fn_link_customer_intake_receipt_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
