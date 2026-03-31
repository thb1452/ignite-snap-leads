-- Fix max_monthly_exports (credits) for each subscription plan.
-- Previous values (5000/15000/25000) were placeholders; correct values per
-- landing page / pricing page copy are 750/1500/3000.
UPDATE subscription_plans SET max_monthly_exports = 750   WHERE name = 'starter';
UPDATE subscription_plans SET max_monthly_exports = 1500  WHERE name = 'professional';
UPDATE subscription_plans SET max_monthly_exports = 3000  WHERE name = 'enterprise';
