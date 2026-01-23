-- Add onboarding_completed column to user_profiles table
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;