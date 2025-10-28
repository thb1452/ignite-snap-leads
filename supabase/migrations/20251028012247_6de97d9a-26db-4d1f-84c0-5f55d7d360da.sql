-- Add INSERT policies for properties and violations tables to allow CSV uploads

-- Allow authenticated users to insert properties
CREATE POLICY "Users can insert properties"
ON public.properties
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to insert violations
CREATE POLICY "Users can insert violations"
ON public.violations
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Create an index on properties for faster lookups during CSV upload
CREATE INDEX IF NOT EXISTS idx_properties_address_city 
ON public.properties (lower(address), lower(city));

-- Create an index on violations for faster lookups
CREATE INDEX IF NOT EXISTS idx_violations_property_case 
ON public.violations (property_id, case_id);