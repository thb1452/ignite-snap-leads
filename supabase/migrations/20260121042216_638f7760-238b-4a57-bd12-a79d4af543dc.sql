-- Create function to auto-assign starter subscription on user signup
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
      now() + interval '100 years'  -- Effectively unlimited for free tier
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on auth.users to auto-assign subscription
DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;
CREATE TRIGGER on_auth_user_created_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_subscription();