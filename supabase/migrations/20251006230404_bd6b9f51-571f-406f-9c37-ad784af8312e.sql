-- Create user_profiles table with credits
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  credits INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON public.user_profiles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.user_profiles
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Function to give new users 10 credits
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, credits)
  VALUES (NEW.id, 10)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Trigger on new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Function to consume credit (atomic operation)
CREATE OR REPLACE FUNCTION public.consume_credit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON public.user_profiles(user_id);