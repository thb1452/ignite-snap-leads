CREATE POLICY "va_update_target_foia_url"
ON public.targets
FOR UPDATE
TO authenticated
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