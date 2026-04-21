CREATE POLICY "Admins manage enrichment-unmatched"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (bucket_id = 'enrichment-unmatched' AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'enrichment-unmatched' AND has_role(auth.uid(), 'admin'::app_role));