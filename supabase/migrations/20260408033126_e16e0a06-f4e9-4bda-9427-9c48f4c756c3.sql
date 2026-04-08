-- Drop the old unoptimized overload (oid 229624) that has p_last_seen_days BEFORE p_sort_by
DROP FUNCTION IF EXISTS fn_properties_paged(integer, integer, text, text, text, integer, integer, integer, text, boolean, boolean, boolean, text);

-- Verify only the optimized version remains
-- The optimized version has signature: (integer, integer, text, text, text, integer, integer, text, boolean, boolean, boolean, integer, text)