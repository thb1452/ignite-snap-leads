-- Add investor_insight_brief JSONB column to properties
ALTER TABLE public.properties
ADD COLUMN IF NOT EXISTS investor_insight_brief jsonb DEFAULT NULL;

-- Add GIN index for efficient JSONB queries
CREATE INDEX IF NOT EXISTS idx_properties_investor_insight_brief
ON public.properties USING gin (investor_insight_brief);

-- Column-level security: revoke UPDATE on this column from anon
REVOKE UPDATE (investor_insight_brief) ON public.properties FROM anon;

-- Grant UPDATE on this column to authenticated users (for caching briefs)
GRANT UPDATE (investor_insight_brief) ON public.properties TO authenticated;

-- Add RLS policy allowing authenticated users to update investor brief
CREATE POLICY "Authenticated users can update investor brief"
ON public.properties
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);