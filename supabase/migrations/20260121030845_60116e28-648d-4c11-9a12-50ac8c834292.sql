-- Fix SECURITY DEFINER views by dropping and recreating with security_invoker = true
-- This makes views respect the querying user's RLS policies

-- First, let's recreate v_user_credits as security invoker
DROP VIEW IF EXISTS public.v_user_credits;
CREATE VIEW public.v_user_credits 
WITH (security_invoker = true) AS
SELECT 
  user_id,
  COALESCE(SUM(delta), 0)::integer AS balance
FROM public.credit_ledger
GROUP BY user_id;

-- Recreate v_hot_properties as security invoker
DROP VIEW IF EXISTS public.v_hot_properties;
CREATE VIEW public.v_hot_properties
WITH (security_invoker = true) AS
SELECT 
  id,
  address,
  city,
  state,
  snap_score,
  snap_insight,
  total_violations,
  oldest_violation_date,
  escalated,
  multi_department,
  distress_signals
FROM public.properties
WHERE snap_score >= 70
ORDER BY snap_score DESC;

-- Recreate v_opportunity_funnel as security invoker  
DROP VIEW IF EXISTS public.v_opportunity_funnel;
CREATE VIEW public.v_opportunity_funnel
WITH (security_invoker = true) AS
SELECT 
  opportunity_class,
  COUNT(*)::bigint AS property_count,
  AVG(snap_score)::numeric AS avg_score
FROM public.properties
GROUP BY opportunity_class;

-- Recreate v_jurisdiction_stats as security invoker
DROP VIEW IF EXISTS public.v_jurisdiction_stats;
CREATE VIEW public.v_jurisdiction_stats
WITH (security_invoker = true) AS
SELECT 
  j.id AS jurisdiction_id,
  j.name AS jurisdiction_name,
  j.city,
  j.state,
  j.enforcement_profile,
  COUNT(p.id)::bigint AS property_count,
  AVG(p.snap_score)::numeric AS avg_score,
  COUNT(CASE WHEN p.snap_score >= 70 THEN 1 END)::bigint AS distressed_count
FROM public.jurisdictions j
LEFT JOIN public.properties p ON p.jurisdiction_id = j.id
GROUP BY j.id, j.name, j.city, j.state, j.enforcement_profile;

-- Recreate v_property_contact_stats as security invoker
DROP VIEW IF EXISTS public.v_property_contact_stats;
CREATE VIEW public.v_property_contact_stats
WITH (security_invoker = true) AS
SELECT 
  property_id,
  COUNT(*)::bigint AS contact_rows,
  COUNT(phone)::bigint AS phones_found,
  COUNT(email)::bigint AS emails_found
FROM public.property_contacts
GROUP BY property_id;