UPDATE subscription_plans SET max_monthly_exports = 5000 WHERE name = 'starter';
UPDATE subscription_plans SET max_monthly_exports = 15000 WHERE name = 'professional';
UPDATE subscription_plans SET max_monthly_exports = 25000 WHERE name = 'enterprise';