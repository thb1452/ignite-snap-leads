-- Fix: Change 100-year billing period to 30 days for proper quota resets
-- This ensures usage quotas reset monthly for free tier users

-- Update the function to use 30 days instead of 100 years
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS TRIGGER AS $$
DECLARE
  starter_plan_id uuid;
BEGIN
  -- Get the starter plan ID
  SELECT id INTO starter_plan_id
  FROM public.subscription_plans
  WHERE name = 'starter' AND is_active = true
  LIMIT 1;

  -- Only create subscription if starter plan exists
  IF starter_plan_id IS NOT NULL THEN
    INSERT INTO public.user_subscriptions (
      user_id,
      plan_id,
      status,
      current_period_start,
      current_period_end
    ) VALUES (
      NEW.id,
      starter_plan_id,
      'active',
      now(),
      now() + interval '30 days'  -- Monthly billing cycle for quota resets
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Also fix any existing subscriptions that have the 100-year period
-- This updates starter plan users to have proper monthly reset cycles
UPDATE public.user_subscriptions
SET current_period_end = current_period_start + interval '30 days'
WHERE plan_id IN (
  SELECT id FROM public.subscription_plans WHERE name = 'starter'
)
AND current_period_end > now() + interval '1 year';
