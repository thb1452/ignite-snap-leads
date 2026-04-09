-- Fix critical Price ID mismatch: update subscription_plans.stripe_price_id to match live Stripe production Price IDs
UPDATE subscription_plans SET stripe_price_id = 'price_1TK03JBg6vwuzzF0lZf6iT1b' WHERE name = 'starter';
UPDATE subscription_plans SET stripe_price_id = 'price_1TK03SBg6vwuzzF0d4M4ZT1A' WHERE name = 'professional';
UPDATE subscription_plans SET stripe_price_id = 'price_1TK05SBg6vwuzzF0Qy6T78LY' WHERE name = 'enterprise';