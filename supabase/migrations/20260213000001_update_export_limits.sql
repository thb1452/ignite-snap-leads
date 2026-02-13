-- ================================================
-- UPDATE EXPORT LIMITS TO NEW PRICING STRUCTURE
-- ================================================
-- Starter: 5,000 exports/month ($119)
-- Pro: 15,000 exports/month ($249)
-- Elite: 50,000 exports/month ($499)
-- ================================================

-- Update Starter tier - 5,000 exports
UPDATE public.subscription_plans
SET
  max_monthly_records = 5000,
  max_csv_exports_per_month = 5000,
  features = '[
    "5,000 monthly exports",
    "All properties, all counties",
    "Code violation data",
    "Weekly data refresh",
    "Email support"
  ]'::jsonb,
  updated_at = now()
WHERE name = 'starter';

-- Update Pro tier - 15,000 exports
UPDATE public.subscription_plans
SET
  max_monthly_records = 15000,
  max_csv_exports_per_month = 15000,
  features = '[
    "15,000 monthly exports",
    "All properties, all counties",
    "Code violation data",
    "Everything in Starter",
    "Pressure Level™ filters",
    "Priority email support"
  ]'::jsonb,
  updated_at = now()
WHERE name = 'professional' OR name = 'pro';

-- Update Elite tier - 50,000 exports
UPDATE public.subscription_plans
SET
  max_monthly_records = 50000,
  max_csv_exports_per_month = 50000,
  features = '[
    "50,000 monthly exports",
    "All properties, all counties",
    "Code violation + water shutoff data",
    "Everything in Pro",
    "API access (coming soon)"
  ]'::jsonb,
  updated_at = now()
WHERE name = 'enterprise' OR name = 'elite';

-- Log the update
COMMENT ON TABLE public.subscription_plans IS 'Updated Feb 2026: Starter 5k, Pro 15k, Elite 50k exports/month';
