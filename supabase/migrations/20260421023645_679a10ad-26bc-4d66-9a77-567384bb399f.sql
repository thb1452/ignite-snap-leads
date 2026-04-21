
-- 1) Global SMS suppression list (cross-org opt-outs)
CREATE TABLE IF NOT EXISTS public.global_sms_suppression (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL UNIQUE,
  opted_out_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL DEFAULT 'STOP_keyword',
  source_org_id uuid NULL
);

CREATE INDEX IF NOT EXISTS idx_global_sms_suppression_phone
  ON public.global_sms_suppression (phone_number);

ALTER TABLE public.global_sms_suppression ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "global_suppression_read_authenticated"
  ON public.global_sms_suppression;
CREATE POLICY "global_suppression_read_authenticated"
  ON public.global_sms_suppression
  FOR SELECT TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies → only service_role can mutate.

-- 2) Atomic claim function for drip-runner (FOR UPDATE SKIP LOCKED)
-- Returns (and locks) up to _limit due, active enrollments, advancing their
-- next_run_at by 5 minutes so a sibling worker won't re-pick them mid-flight.
CREATE OR REPLACE FUNCTION public.claim_due_drip_enrollments(_limit int DEFAULT 50)
RETURNS TABLE (
  id uuid,
  org_id uuid,
  lead_id uuid,
  sequence_id uuid,
  current_step int,
  to_number text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT e.id
    FROM public.drip_enrollments e
    WHERE e.status = 'active'
      AND e.next_run_at <= now()
    ORDER BY e.next_run_at ASC
    LIMIT _limit
    FOR UPDATE SKIP LOCKED
  ),
  bumped AS (
    UPDATE public.drip_enrollments e
    SET next_run_at = now() + interval '5 minutes'
    FROM claimed
    WHERE e.id = claimed.id
    RETURNING e.id, e.org_id, e.lead_id, e.sequence_id, e.current_step, e.to_number
  )
  SELECT b.id, b.org_id, b.lead_id, b.sequence_id, b.current_step, b.to_number FROM bumped b;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_drip_enrollments(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_due_drip_enrollments(int) TO service_role;
