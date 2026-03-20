
-- Create dedicated admin plan cloned from enterprise, with 50k exports
INSERT INTO subscription_plans (name, display_name, description, price_monthly_cents, price_annual_cents, max_monthly_exports, max_counties, max_user_seats, max_skip_traces_per_month, features, has_advanced_filters, has_violation_filtering, has_rolling_intelligence, has_escalation_alerts, has_api_access, has_dedicated_manager, sort_order, is_active, max_states, data_tier)
SELECT 'enterprise_admin', display_name, description, price_monthly_cents, price_annual_cents, 50000, max_counties, max_user_seats, max_skip_traces_per_month, features, has_advanced_filters, has_violation_filtering, has_rolling_intelligence, has_escalation_alerts, has_api_access, has_dedicated_manager, 99, true, max_states, data_tier
FROM subscription_plans WHERE id = '64d794a7-a4e4-42fe-ae50-8a3d68f9c134';

-- Reassign admin to new plan
UPDATE user_subscriptions 
SET plan_id = (SELECT id FROM subscription_plans WHERE name = 'enterprise_admin' LIMIT 1)
WHERE user_id = '242fb409-b137-46d5-9aa6-2696710f5fcd';
