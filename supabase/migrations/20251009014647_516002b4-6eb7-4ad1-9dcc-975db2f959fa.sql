-- Add computed columns for unique constraint on credit_ledger
ALTER TABLE credit_ledger 
ADD COLUMN IF NOT EXISTS job_id_extracted uuid GENERATED ALWAYS AS ((meta->>'job_id')::uuid) STORED,
ADD COLUMN IF NOT EXISTS property_id_extracted uuid GENERATED ALWAYS AS ((meta->>'property_id')::uuid) STORED;

-- Create unique index to prevent double refunds
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ledger_job_prop_reason 
ON credit_ledger(user_id, job_id_extracted, property_id_extracted, reason)
WHERE job_id_extracted IS NOT NULL AND property_id_extracted IS NOT NULL;

-- Update fn_refund_credits to prevent double refunds with ON CONFLICT
CREATE OR REPLACE FUNCTION public.fn_refund_credits(p_property_ids uuid[], p_job_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_qty int := 0;
  v_balance int;
BEGIN
  -- Insert refund credits with conflict protection (prevents double refunds)
  INSERT INTO credit_ledger (user_id, delta, reason, meta)
  SELECT 
    v_user_id,
    1,
    p_reason,
    jsonb_build_object('job_id', p_job_id, 'property_id', pid)
  FROM unnest(p_property_ids) AS pid
  ON CONFLICT (user_id, job_id_extracted, property_id_extracted, reason) 
  WHERE job_id_extracted IS NOT NULL AND property_id_extracted IS NOT NULL
  DO NOTHING;
  
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  
  SELECT balance INTO v_balance FROM v_user_credits WHERE user_id = v_user_id;
  
  RETURN jsonb_build_object(
    'refunded', v_qty,
    'new_balance', v_balance
  );
END;
$function$;