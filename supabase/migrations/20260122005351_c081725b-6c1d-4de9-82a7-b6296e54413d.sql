
-- Remove the broken trigger that gives free subscriptions
DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;

-- Drop the function too
DROP FUNCTION IF EXISTS public.handle_new_user_subscription();

-- Clean up any existing free subscriptions that don't have Stripe IDs
-- (real paying customers will have stripe_subscription_id set)
DELETE FROM public.user_subscriptions 
WHERE stripe_subscription_id IS NULL 
  AND stripe_customer_id IS NULL;
