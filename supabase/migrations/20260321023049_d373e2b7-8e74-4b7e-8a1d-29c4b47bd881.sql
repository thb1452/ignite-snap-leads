-- Update subscription plan prices to match new pricing tiers
UPDATE public.subscription_plans
SET price_monthly_cents = CASE 
    WHEN name = 'starter' THEN 4900
    WHEN name = 'professional' THEN 9900
    WHEN name = 'enterprise' THEN 19900
    ELSE price_monthly_cents
  END
WHERE name IN ('starter', 'professional', 'enterprise');

-- Also update display names to match new branding
UPDATE public.subscription_plans
SET display_name = 'Elite'
WHERE name = 'enterprise' AND display_name = 'Enterprise';
