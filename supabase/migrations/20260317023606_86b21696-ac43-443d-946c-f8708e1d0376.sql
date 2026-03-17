
-- Drop old overloads that don't have p_random_seed
DROP FUNCTION IF EXISTS public.fn_properties_paged(integer, integer, text, text, text, integer, integer, integer, text, boolean, boolean, boolean);
DROP FUNCTION IF EXISTS public.fn_properties_by_category(text, text, text, text, integer, integer, integer, integer, integer, text, boolean, boolean, boolean);
