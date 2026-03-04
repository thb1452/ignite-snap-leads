
-- Allow VAs to update portal_difficulty_score on targets they are assigned to
CREATE POLICY "va_rate_portal_difficulty" ON public.targets
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.foia_assignments
      WHERE foia_assignments.target_id = targets.id
        AND foia_assignments.va_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.foia_assignments
      WHERE foia_assignments.target_id = targets.id
        AND foia_assignments.va_id = auth.uid()
    )
  );
