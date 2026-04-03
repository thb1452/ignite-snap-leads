UPDATE public.subscription_plans
SET max_monthly_exports = CASE name
  WHEN 'starter' THEN 750
  WHEN 'professional' THEN 1500
  WHEN 'enterprise' THEN 3000
  ELSE max_monthly_exports
END,
updated_at = now()
WHERE name IN ('starter', 'professional', 'enterprise');