-- Drop the OLD 9-parameter overload of fn_properties_paged that causes PostgREST ambiguity
-- Keep only the 12-parameter version with pressure level filters
DROP FUNCTION IF EXISTS public.fn_properties_paged(integer, integer, text, text, text, integer, integer, integer, text);

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';