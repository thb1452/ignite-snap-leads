
-- 1. Add street_number and street_name to properties
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS street_number TEXT,
  ADD COLUMN IF NOT EXISTS street_name TEXT;

-- 2. Add monetization columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS free_unlocks_remaining INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS daily_view_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_view_reset_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS referred_by UUID;

-- 3. Add notification columns to saved_properties
ALTER TABLE public.saved_properties
  ADD COLUMN IF NOT EXISTS notify_on_new_violation BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ;

-- 4. Create unlocked_properties table
CREATE TABLE IF NOT EXISTS public.unlocked_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  credit_cost INTEGER NOT NULL DEFAULT 1,
  unlock_source TEXT NOT NULL CHECK (unlock_source IN ('free_credit', 'paid_unlock', 'subscription', 'credit_pack'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unlocked_properties_user_property ON public.unlocked_properties(user_id, property_id);
CREATE INDEX IF NOT EXISTS idx_unlocked_properties_property ON public.unlocked_properties(property_id);

ALTER TABLE public.unlocked_properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own unlocks"
  ON public.unlocked_properties FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policies — writes via SECURITY DEFINER only

-- 5. Create transactions table
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  stripe_payment_intent_id TEXT UNIQUE,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON public.transactions(user_id);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON public.transactions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 6. Create affiliate_referrals table
CREATE TABLE IF NOT EXISTS public.affiliate_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL,
  referred_user_id UUID NOT NULL UNIQUE,
  signup_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_purchase_at TIMESTAMPTZ,
  commission_paid BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_referrer ON public.affiliate_referrals(referrer_id);

ALTER TABLE public.affiliate_referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own referrals"
  ON public.affiliate_referrals FOR SELECT
  TO authenticated
  USING (referrer_id = auth.uid());

-- 7. Create affiliate_commissions table
CREATE TABLE IF NOT EXISTS public.affiliate_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id UUID NOT NULL REFERENCES public.affiliate_referrals(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  commission_rate INTEGER NOT NULL DEFAULT 30,
  paid_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled'))
);

ALTER TABLE public.affiliate_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own commissions"
  ON public.affiliate_commissions FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.affiliate_referrals ar
    WHERE ar.id = affiliate_commissions.referral_id
    AND ar.referrer_id = auth.uid()
  ));

-- 8. Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
