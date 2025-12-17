-- ================================================
-- UPDATE PRICING STRATEGY TO ENFORCEMENT PRESSURE INTELLIGENCE MODEL
-- ================================================
-- This migration updates the pricing tiers to match the new strategy:
-- - Starter: $129/mo (was $39)
-- - Pro: $249/mo (was $89)
-- - Elite: $499/mo (was $199)
--
-- Key changes:
-- - Positioned as "Enforcement Pressure Intelligence" not commodity data
-- - Higher value positioning with premium pricing
-- - Focus on county access vs jurisdictions
-- - Export limits based on professional usage patterns
-- ================================================

-- Update Starter tier ($129/mo)
UPDATE public.subscription_plans
SET
  price_monthly_cents = 12900, -- $129/mo
  max_jurisdictions = 5, -- 5 active counties
  max_monthly_records = 25000, -- 25,000 exports/month
  max_csv_exports_per_month = 25, -- 25 CSV exports/month
  skip_trace_credits_per_month = 1000, -- 1,000 skip trace credits/month
  description = 'Perfect for focused local wholesalers and investors',
  features = '[
    "5 active counties",
    "25,000 monthly exports",
    "1,000 skip trace credits/month",
    "AI enforcement pressure scoring (SnapScore)",
    "CSV exports with standardized schema",
    "Priority county requests",
    "Email support"
  ]'::jsonb,
  updated_at = now()
WHERE name = 'starter';

-- Update Pro tier ($249/mo)
UPDATE public.subscription_plans
SET
  price_monthly_cents = 24900, -- $249/mo
  max_jurisdictions = 15, -- 15 active counties
  max_monthly_records = 75000, -- 75,000 exports/month
  max_csv_exports_per_month = 75, -- 75 CSV exports/month
  skip_trace_credits_per_month = 3000, -- 3,000 skip trace credits/month
  can_bulk_sms = true,
  description = 'For multi-market investors and growing teams',
  features = '[
    "15 active counties",
    "75,000 monthly exports",
    "3,000 skip trace credits/month",
    "AI enforcement pressure scoring",
    "Priority county updates",
    "Bulk export formats",
    "Bulk SMS campaigns",
    "Priority email + chat support"
  ]'::jsonb,
  updated_at = now()
WHERE name = 'pro';

-- Update Elite tier ($499/mo)
UPDATE public.subscription_plans
SET
  price_monthly_cents = 49900, -- $499/mo
  max_jurisdictions = -1, -- Unlimited counties
  max_monthly_records = 250000, -- 250,000 exports/month
  max_csv_exports_per_month = -1, -- Unlimited exports
  skip_trace_credits_per_month = 10000, -- 10,000 skip trace credits/month
  can_access_api = true,
  can_bulk_sms = true,
  can_bulk_mail = true,
  description = 'For institutional operators and large teams',
  features = '[
    "Unlimited counties",
    "250,000 monthly exports",
    "10,000 skip trace credits/month",
    "AI enforcement pressure scoring",
    "Priority updates for all active counties",
    "API access",
    "Custom integrations",
    "Bulk SMS & Mail campaigns",
    "Dedicated account manager",
    "Phone support"
  ]'::jsonb,
  updated_at = now()
WHERE name = 'elite';

-- Update free trial (keep as-is for now, but update description)
UPDATE public.subscription_plans
SET
  description = '14-day free trial to experience Snap''s enforcement pressure intelligence',
  features = '[
    "14-day free trial",
    "1 county access",
    "100 records",
    "3 CSV exports",
    "5 skip trace credits",
    "Access to properties with SnapScore ≥ 40",
    "Full feature preview"
  ]'::jsonb,
  updated_at = now()
WHERE name = 'free_trial';

-- Add pricing strategy metadata to track ROI messaging
COMMENT ON TABLE public.subscription_plans IS 'Enforcement Pressure Intelligence pricing tiers - positioned as premium intelligence tool, not commodity data. Target ROI: one deal pays for 6-9 months at Starter tier.';

-- Add helpful view for displaying pricing
CREATE OR REPLACE VIEW public.active_pricing_tiers AS
SELECT
  id,
  name,
  display_name,
  price_monthly_cents,
  price_monthly_cents * 10 AS price_annual_cents, -- 20% discount (12mo - 2.4mo = 9.6mo effective cost)
  ROUND((price_monthly_cents * 12 * 0.8)::numeric, 0)::integer AS price_annual_cents_with_discount,
  max_jurisdictions,
  max_monthly_records,
  max_csv_exports_per_month,
  skip_trace_credits_per_month,
  can_access_api,
  can_bulk_sms,
  can_bulk_mail,
  description,
  features,
  sort_order
FROM public.subscription_plans
WHERE is_active = true
  AND name != 'free_trial'
ORDER BY sort_order;

-- Grant access to the view
GRANT SELECT ON public.active_pricing_tiers TO authenticated;
GRANT SELECT ON public.active_pricing_tiers TO anon;

-- Add RLS policy for the view (allows anyone to see pricing)
CREATE POLICY "Anyone can view active pricing tiers"
ON public.subscription_plans
FOR SELECT
USING (true);

COMMENT ON VIEW public.active_pricing_tiers IS 'Public-facing pricing tiers with annual discount calculations (20% off annual billing)';
