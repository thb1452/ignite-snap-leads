-- Fix function search_path issues for existing functions
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.user_profiles (user_id, credits)
  VALUES (NEW.id, 10)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.consume_credit(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  current_credits INTEGER;
BEGIN
  -- Get current credits and lock the row
  SELECT credits INTO current_credits
  FROM public.user_profiles
  WHERE user_id = p_user_id
  FOR UPDATE;
  
  -- Check if user has credits
  IF current_credits IS NULL OR current_credits <= 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
  END IF;
  
  -- Deduct credit
  UPDATE public.user_profiles
  SET credits = credits - 1, updated_at = now()
  WHERE user_id = p_user_id;
  
  -- Return new balance
  RETURN current_credits - 1;
END;
$function$;