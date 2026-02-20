
-- Backfill: add 'user' role to all existing users who have a subscription but no role
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT us.user_id, 'user'::app_role
FROM public.user_subscriptions us
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = us.user_id
)
ON CONFLICT DO NOTHING;
