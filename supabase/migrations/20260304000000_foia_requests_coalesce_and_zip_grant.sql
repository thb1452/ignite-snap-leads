-- Capture two net-new changes applied directly by Lovable that are not yet
-- represented in any earlier migration, plus the missing fn_zip_pressure grant
-- flagged during the feature audit.
--
-- 1. foia_requests_select — broaden to COALESCE(va_id, requested_by).
--    The previous policy (from 20260227200000) used only `va_id = auth.uid()`,
--    which silently hides requests inserted with `requested_by` set and `va_id`
--    NULL.  The COALESCE version handles both columns so every user sees their
--    own requests regardless of which FK was populated.
--
-- 2. foia_requests_insert — mirror the same two-column pattern so users can
--    insert with either va_id or requested_by without hitting an RLS violation.
--    The old policy (from 20260224000000) only allowed `va_id = auth.uid()`.
--
-- 3. fn_zip_pressure GRANT — the function was created in migration
--    20260303232011 without a GRANT EXECUTE, meaning authenticated users
--    receive "permission denied" when the heatmap calls the RPC.

-- ── 1. foia_requests RLS ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "foia_requests_select" ON public.foia_requests;
DROP POLICY IF EXISTS "foia_requests_insert" ON public.foia_requests;
DROP POLICY IF EXISTS "VAs can view their own requests"   ON public.foia_requests;
DROP POLICY IF EXISTS "VAs can insert their own requests" ON public.foia_requests;

CREATE POLICY "foia_requests_select" ON public.foia_requests
  FOR SELECT USING (
    COALESCE(va_id, requested_by) = auth.uid()
    OR public.is_foia_admin()
  );

CREATE POLICY "foia_requests_insert" ON public.foia_requests
  FOR INSERT WITH CHECK (
    (va_id       IS NOT NULL AND va_id       = auth.uid())
    OR (requested_by IS NOT NULL AND requested_by = auth.uid())
  );

-- ── 2. fn_zip_pressure GRANT ──────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.fn_zip_pressure(text, text) TO authenticated;
