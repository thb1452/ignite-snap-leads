
-- 1. Customer overview view joining profiles + subscriptions + transaction totals
CREATE OR REPLACE VIEW public.v_customer_overview WITH (security_invoker = true) AS
SELECT
  p.user_id,
  p.email,
  p.full_name,
  p.created_at AS signup_date,
  p.is_beta_user,
  p.free_unlocks_remaining,
  us.status AS subscription_status,
  us.stripe_customer_id,
  us.stripe_subscription_id,
  us.current_period_start,
  us.current_period_end,
  us.trial_started_at,
  us.trial_ends_at,
  us.trial_tier,
  sp.display_name AS plan_name,
  sp.price_monthly_cents,
  COALESCE(t.total_revenue, 0) AS total_revenue_cents,
  COALESCE(t.transaction_count, 0) AS transaction_count,
  t.last_transaction_at
FROM public.profiles p
LEFT JOIN public.user_subscriptions us ON us.user_id = p.user_id
LEFT JOIN public.subscription_plans sp ON sp.id = us.plan_id
LEFT JOIN LATERAL (
  SELECT
    SUM(tx.amount) AS total_revenue,
    COUNT(*) AS transaction_count,
    MAX(tx.created_at) AS last_transaction_at
  FROM public.transactions tx
  WHERE tx.user_id = p.user_id AND tx.status = 'succeeded'
) t ON true;

-- 2. Admin read-only policy on webhook_events
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read webhook_events"
  ON public.webhook_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Admin read-only policy on transactions (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'transactions'
      AND policyname = 'Admins can read all transactions'
  ) THEN
    EXECUTE 'CREATE POLICY "Admins can read all transactions" ON public.transactions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), ''admin''::app_role))';
  END IF;
END $$;
