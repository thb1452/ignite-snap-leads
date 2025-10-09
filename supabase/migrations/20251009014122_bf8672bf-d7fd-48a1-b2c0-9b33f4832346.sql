-- Add unique constraint for idempotency (prevents race conditions)
ALTER TABLE skiptrace_jobs 
ADD CONSTRAINT uq_skiptrace_jobs_job_key UNIQUE (job_key);

-- Update fn_charge_credits to use proper error codes
CREATE OR REPLACE FUNCTION public.fn_charge_credits(p_property_ids uuid[], p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_qty int := array_length(p_property_ids, 1);
  v_balance int;
BEGIN
  -- Lock user profile row
  SELECT balance INTO v_balance
  FROM v_user_credits
  WHERE user_id = v_user_id
  FOR UPDATE;
  
  -- Check sufficient credits with proper error code
  IF v_balance IS NULL OR v_balance < v_qty THEN
    RAISE EXCEPTION 'insufficient credits'
      USING ERRCODE = 'P0001',
            DETAIL = 'INSUFFICIENT_CREDITS';
  END IF;
  
  -- Charge credits (negative delta)
  INSERT INTO credit_ledger (user_id, delta, reason, meta)
  SELECT 
    v_user_id,
    -1,
    'skiptrace_charge',
    jsonb_build_object('job_id', p_job_id, 'property_id', pid)
  FROM unnest(p_property_ids) AS pid;
  
  RETURN jsonb_build_object(
    'charged', v_qty,
    'new_balance', v_balance - v_qty
  );
END;
$function$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_skiptrace_jobs_user_status ON skiptrace_jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_skiptrace_jobs_created ON skiptrace_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_property_contacts_property ON property_contacts(property_id);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user ON credit_ledger(user_id, created_at DESC);