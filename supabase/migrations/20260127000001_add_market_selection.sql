-- Add market selection fields to user_profiles
-- These store the user's default market for map auto-zoom and filter pre-population
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS default_state text,
  ADD COLUMN IF NOT EXISTS default_city text;
