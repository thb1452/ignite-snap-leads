-- ================================================
-- UPDATE PRICING AND EXPORT LIMITS - PropStream Stack Positioning
-- ================================================
-- Starter: $79/mo, 1,500 exports/month (was $119, 5,000)
-- Pro: $149/mo, 5,000 exports/month (was $249, 15,000)
-- Elite: $299/mo, 15,000 exports/month (was $499, 50,000)
-- ================================================

-- Update Starter tier
UPDATE public.subscription_plans
SET
  price_monthly_cents = 7900,
  price_annual_cents = 76000,
  max_monthly_exports = 1500,
  max_monthly_records = 1500,
  max_csv_exports_per_month = 1500,
  description = 'For PropStream users who want premium targeting',
  features = '[
    "1,500 monthly exports",
    "All properties, all counties",
    "Code violation data",
    "Basic filters (location, category, search)",
    "Weekly data refresh",
    "Email support"
  ]'::jsonb,
  updated_at = now()
WHERE name = 'starter';

-- Update Pro tier
UPDATE public.subscription_plans
SET
  price_monthly_cents = 14900,
  price_annual_cents = 143000,
  max_monthly_exports = 5000,
  max_monthly_records = 5000,
  max_csv_exports_per_month = 5000,
  description = 'For serious operators stacking enforcement data',
  features = '[
    "5,000 monthly exports",
    "All properties, all counties",
    "Code violation data",
    "Everything in Starter",
    "Pressure Level™ filters",
    "Priority email support"
  ]'::jsonb,
  updated_at = now()
WHERE name = 'professional' OR name = 'pro';

-- Update Elite tier
UPDATE public.subscription_plans
SET
  price_monthly_cents = 29900,
  price_annual_cents = 287000,
  max_monthly_exports = 15000,
  max_monthly_records = 15000,
  max_csv_exports_per_month = 15000,
  description = 'For teams running enforcement-first strategies',
  features = '[
    "15,000 monthly exports",
    "All properties, all counties",
    "Code violation + water shutoff data",
    "Everything in Pro",
    "API access (coming soon)"
  ]'::jsonb,
  updated_at = now()
WHERE name = 'enterprise' OR name = 'elite';

-- Update Free Trial plan export display (trial limit stays at 50 total, not monthly)
UPDATE public.subscription_plans
SET
  features = '[
    "50 total property exports",
    "All properties, all counties",
    "Code violation data",
    "7-day access"
  ]'::jsonb,
  updated_at = now()
WHERE name = 'free_trial';

-- Log the update
COMMENT ON TABLE public.subscription_plans IS 'Updated Feb 17 2026: Starter $79/1.5k, Pro $149/5k, Elite $299/15k exports/month - PropStream stack positioning';
