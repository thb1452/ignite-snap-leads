
-- Fix 1: Replace flawed UNIQUE(user_id, status) with partial unique index
-- This prevents multiple non-cancelled subscriptions per user

-- Drop the existing flawed constraint
ALTER TABLE public.user_subscriptions DROP CONSTRAINT IF EXISTS unique_active_subscription;

-- Create proper partial unique index - only one non-cancelled subscription per user
CREATE UNIQUE INDEX unique_non_cancelled_subscription 
ON public.user_subscriptions (user_id) 
WHERE status NOT IN ('cancelled');
