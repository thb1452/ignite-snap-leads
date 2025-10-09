-- Production hardening for skip-trace system

-- 1) Add unique constraint on job_key for idempotency
ALTER TABLE skiptrace_jobs 
  DROP CONSTRAINT IF EXISTS skiptrace_jobs_job_key_unique,
  ADD CONSTRAINT skiptrace_jobs_job_key_unique UNIQUE (job_key);

-- 2) Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_skiptrace_jobs_user_created 
  ON skiptrace_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_skiptrace_jobs_status 
  ON skiptrace_jobs(status) WHERE status IN ('queued', 'processing');
CREATE INDEX IF NOT EXISTS idx_property_contacts_property 
  ON property_contacts(property_id);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created 
  ON credit_ledger(user_id, created_at DESC);

-- 3) Atomic credit charge with row locking
CREATE OR REPLACE FUNCTION fn_charge_credits(
  p_property_ids uuid[],
  p_job_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  
  -- Check sufficient credits
  IF v_balance IS NULL OR v_balance < v_qty THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
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
$$;

-- 4) Refund function for failed/no-match properties
CREATE OR REPLACE FUNCTION fn_refund_credits(
  p_property_ids uuid[],
  p_job_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_qty int := array_length(p_property_ids, 1);
  v_balance int;
BEGIN
  -- Add refund credits (positive delta)
  INSERT INTO credit_ledger (user_id, delta, reason, meta)
  SELECT 
    v_user_id,
    1,
    p_reason,
    jsonb_build_object('job_id', p_job_id, 'property_id', pid)
  FROM unnest(p_property_ids) AS pid;
  
  SELECT balance INTO v_balance FROM v_user_credits WHERE user_id = v_user_id;
  
  RETURN jsonb_build_object(
    'refunded', v_qty,
    'new_balance', v_balance
  );
END;
$$;

-- 5) Function to get job status with counts
CREATE OR REPLACE FUNCTION fn_job_status(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job record;
  v_contacts_count int;
BEGIN
  SELECT * INTO v_job
  FROM skiptrace_jobs
  WHERE id = p_job_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Job not found');
  END IF;
  
  -- Count contacts created for this job's properties
  SELECT COUNT(*) INTO v_contacts_count
  FROM property_contacts
  WHERE property_id = ANY(v_job.property_ids)
    AND created_at >= v_job.created_at;
  
  RETURN jsonb_build_object(
    'id', v_job.id,
    'status', v_job.status,
    'counts', v_job.counts,
    'contacts_found', v_contacts_count,
    'created_at', v_job.created_at,
    'started_at', v_job.started_at,
    'finished_at', v_job.finished_at,
    'error', v_job.error
  );
END;
$$;