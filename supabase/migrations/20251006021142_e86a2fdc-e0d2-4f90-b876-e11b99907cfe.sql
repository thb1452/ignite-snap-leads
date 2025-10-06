-- Fix security definer view warning
ALTER VIEW public.v_user_credits SET (security_invoker = on);