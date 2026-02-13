-- Update export limits to match new pricing tiers
UPDATE subscription_plans SET max_monthly_exports = 5000 WHERE name = 'starter';
UPDATE subscription_plans SET max_monthly_exports = 15000 WHERE name = 'professional';
UPDATE subscription_plans SET max_monthly_exports = 50000 WHERE name = 'enterprise';
