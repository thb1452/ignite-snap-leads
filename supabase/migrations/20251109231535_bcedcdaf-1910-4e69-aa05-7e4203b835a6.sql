-- Add DELETE policies for properties and violations tables
-- This allows authenticated users to delete properties and their violations

-- Enable delete on properties for authenticated users
CREATE POLICY "Users can delete properties"
ON public.properties
FOR DELETE
TO authenticated
USING (true);

-- Enable delete on violations for authenticated users  
CREATE POLICY "Users can delete violations"
ON public.violations
FOR DELETE
TO authenticated
USING (true);