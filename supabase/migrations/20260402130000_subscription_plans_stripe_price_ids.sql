-- Map Stripe Price IDs to plans so webhooks can sync plan_id on subscription.updated / invoice events.
-- Canonical IDs: supabase/functions/_shared/stripeSubscriptionPlan.ts (STRIPE_SUBSCRIPTION_PRICE_IDS_BY_PLAN).
UPDATE public.subscription_plans
SET stripe_price_id = 'price_1TGlbmPfDZrVNjz5doWbUyvN'
WHERE name = 'starter';

UPDATE public.subscription_plans
SET stripe_price_id = 'price_1TGlb4PfDZrVNjz5WqCEG1D9'
WHERE name = 'professional';

UPDATE public.subscription_plans
SET stripe_price_id = 'price_1TGlcePfDZrVNjz5VLCsLkBQ'
WHERE name = 'enterprise';
