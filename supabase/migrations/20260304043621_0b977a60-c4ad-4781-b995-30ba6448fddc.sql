-- 1. Backfill response_received_at for existing fulfilled records
UPDATE foia_requests
SET response_received_at = COALESCE(fulfillment_received_at, updated_at)
WHERE status = 'fulfilled'
  AND response_received_at IS NULL;

-- 2. UNIQUE constraint on foia_requests(target_id, va_id) — no dupes exist
CREATE UNIQUE INDEX uq_foia_requests_target_va
  ON foia_requests (target_id, va_id)
  WHERE target_id IS NOT NULL AND va_id IS NOT NULL;

-- 3. UNIQUE constraint on foia_assignments(target_id)
CREATE UNIQUE INDEX uq_foia_assignments_target
  ON foia_assignments (target_id);

-- 4. Create is_foia_va() helper if missing
CREATE OR REPLACE FUNCTION public.is_foia_va()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM foia_profiles
    WHERE id = auth.uid() AND role = 'va' AND is_active = true
  );
$$;