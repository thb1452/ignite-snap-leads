-- Fix: Add missing GRANT EXECUTE for enrichment RPC functions
-- These functions were created in 20260314190000 but without GRANT,
-- causing "permission denied" when called via supabase.rpc() from the frontend.

GRANT EXECUTE ON FUNCTION public.fn_check_enrichment_limit(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_consume_enrichment_usage(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_enrichment_usage(uuid) TO authenticated;
