-- ============================================================
-- Subscription Unlock System
-- ============================================================
-- Implements the correct unlock priority order:
--   1. Subscription monthly allowance (resets each billing period)
--   2. Bulk credits (never expire)
--   3. Free unlocks (3 on signup, one-time)
--   4. PAYG (frontend redirects to Stripe — not handled here)
-- ============================================================

-- 1. Add unlocks_count to subscription_usage
ALTER TABLE public.subscription_usage
  ADD COLUMN IF NOT EXISTS unlocks_count integer NOT NULL DEFAULT 0;

-- 2. fn_get_unlock_balances — single RPC the modal calls to get all balances at once
CREATE OR REPLACE FUNCTION public.fn_get_unlock_balances(p_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription_remaining  integer := 0;
  v_subscription_limit      integer := 0;
  v_subscription_used       integer := 0;
  v_credit_balance          integer := 0;
  v_free_remaining          integer := 0;
  v_plan_name               text    := null;
  v_period_start            date;
  v_period_end              date;
  v_renewal_date            text    := null;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  -- Subscription allowance
  SELECT
    sp.max_monthly_exports,
    us.current_period_start::date,
    us.current_period_end::date,
    sp.name
  INTO v_subscription_limit, v_period_start, v_period_end, v_plan_name
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = p_user_id
    AND us.status IN ('active', 'trialing', 'past_due')
  ORDER BY us.created_at DESC
  LIMIT 1;

  IF v_period_start IS NOT NULL THEN
    SELECT COALESCE(su.unlocks_count, 0)
    INTO v_subscription_used
    FROM subscription_usage su
    WHERE su.user_id = p_user_id
      AND su.period_start = v_period_start
    LIMIT 1;

    v_subscription_remaining := GREATEST(0, v_subscription_limit - v_subscription_used);
    v_renewal_date := v_period_end::text;
  END IF;

  -- Bulk credit balance
  SELECT COALESCE(SUM(delta), 0)
  INTO v_credit_balance
  FROM credit_ledger
  WHERE user_id = p_user_id;

  v_credit_balance := GREATEST(0, v_credit_balance);

  -- Free unlocks
  SELECT COALESCE(free_unlocks_remaining, 0)
  INTO v_free_remaining
  FROM profiles
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'subscription_remaining', v_subscription_remaining,
    'subscription_limit',     v_subscription_limit,
    'subscription_used',      v_subscription_used,
    'credit_balance',         v_credit_balance,
    'free_remaining',         v_free_remaining,
    'plan_name',              v_plan_name,
    'renewal_date',           v_renewal_date
  );
END;
$$;

-- 3. Rewrite fn_unlock_property with correct priority + optional source override
--    p_source: null (auto-priority) | 'subscription' | 'credit' | 'free'
CREATE OR REPLACE FUNCTION public.fn_unlock_property(
  p_user_id    uuid,
  p_property_id uuid,
  p_source      text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_already_unlocked        boolean;
  v_free_remaining          integer;
  v_credit_balance          integer;
  v_subscription_limit      integer := 0;
  v_subscription_used       integer := 0;
  v_subscription_remaining  integer := 0;
  v_period_start            date;
  v_effective_source        text;
BEGIN
  -- Idempotent check
  SELECT EXISTS(
    SELECT 1 FROM unlocked_properties
    WHERE user_id = p_user_id AND property_id = p_property_id
  ) INTO v_already_unlocked;

  IF v_already_unlocked THEN
    RETURN jsonb_build_object('success', true, 'source', 'already_unlocked');
  END IF;

  -- Load all balances
  SELECT COALESCE(free_unlocks_remaining, 0)
  INTO v_free_remaining
  FROM profiles WHERE user_id = p_user_id;

  SELECT COALESCE(SUM(delta), 0)
  INTO v_credit_balance
  FROM credit_ledger WHERE user_id = p_user_id;
  v_credit_balance := GREATEST(0, v_credit_balance);

  SELECT
    sp.max_monthly_exports,
    us.current_period_start::date
  INTO v_subscription_limit, v_period_start
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = p_user_id
    AND us.status IN ('active', 'trialing', 'past_due')
  ORDER BY us.created_at DESC
  LIMIT 1;

  IF v_period_start IS NOT NULL THEN
    SELECT COALESCE(unlocks_count, 0)
    INTO v_subscription_used
    FROM subscription_usage
    WHERE user_id = p_user_id AND period_start = v_period_start
    LIMIT 1;

    v_subscription_remaining := GREATEST(0, v_subscription_limit - v_subscription_used);
  END IF;

  -- Determine effective source (auto-priority if not specified)
  IF p_source IS NULL THEN
    IF v_subscription_remaining > 0 THEN
      v_effective_source := 'subscription';
    ELSIF v_credit_balance >= 1 THEN
      v_effective_source := 'credit';
    ELSIF v_free_remaining > 0 THEN
      v_effective_source := 'free';
    ELSE
      RETURN jsonb_build_object(
        'success',                  false,
        'error',                    'insufficient_balance',
        'subscription_remaining',   v_subscription_remaining,
        'credit_balance',           v_credit_balance,
        'free_remaining',           v_free_remaining
      );
    END IF;
  ELSE
    v_effective_source := p_source;
  END IF;

  -- Execute the chosen source
  IF v_effective_source = 'subscription' THEN
    IF v_subscription_remaining <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'subscription_limit_reached',
        'subscription_remaining', 0);
    END IF;

    -- Upsert subscription_usage and increment unlocks_count
    INSERT INTO subscription_usage (user_id, period_start, period_end, unlocks_count)
    SELECT
      p_user_id,
      v_period_start,
      us.current_period_end::date,
      1
    FROM user_subscriptions us
    WHERE us.user_id = p_user_id
      AND us.status IN ('active', 'trialing', 'past_due')
    ORDER BY us.created_at DESC
    LIMIT 1
    ON CONFLICT (user_id, period_start)
    DO UPDATE SET
      unlocks_count = subscription_usage.unlocks_count + 1,
      updated_at    = now();

    INSERT INTO unlocked_properties (user_id, property_id, credit_cost, unlock_source)
    VALUES (p_user_id, p_property_id, 0, 'subscription');

    -- Grant export credit so export-csv PAYG gate allows export
    INSERT INTO credit_ledger (user_id, delta, reason, property_id_extracted, meta)
    VALUES (p_user_id, 1, 'subscription_unlock_export', p_property_id,
            jsonb_build_object('property_id', p_property_id));

    RETURN jsonb_build_object(
      'success',                  true,
      'source',                   'subscription',
      'subscription_remaining',   v_subscription_remaining - 1,
      'subscription_used',        v_subscription_used + 1
    );

  ELSIF v_effective_source = 'credit' THEN
    IF v_credit_balance < 1 THEN
      RETURN jsonb_build_object('success', false, 'error', 'insufficient_credits',
        'credit_balance', 0);
    END IF;

    INSERT INTO credit_ledger (user_id, delta, reason, property_id_extracted, meta)
    VALUES (p_user_id, -1, 'property_unlock', p_property_id,
            jsonb_build_object('property_id', p_property_id));

    INSERT INTO unlocked_properties (user_id, property_id, credit_cost, unlock_source)
    VALUES (p_user_id, p_property_id, 1, 'credit_pack');

    RETURN jsonb_build_object(
      'success',          true,
      'source',           'credit',
      'credit_balance',   v_credit_balance - 1
    );

  ELSIF v_effective_source = 'free' THEN
    IF v_free_remaining <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'no_free_unlocks',
        'free_remaining', 0);
    END IF;

    UPDATE profiles
    SET free_unlocks_remaining = free_unlocks_remaining - 1
    WHERE user_id = p_user_id;

    INSERT INTO unlocked_properties (user_id, property_id, credit_cost, unlock_source)
    VALUES (p_user_id, p_property_id, 0, 'free_credit');

    -- Grant export credit so export-csv allows export
    INSERT INTO credit_ledger (user_id, delta, reason, property_id_extracted, meta)
    VALUES (p_user_id, 1, 'free_unlock_export', p_property_id,
            jsonb_build_object('property_id', p_property_id));

    RETURN jsonb_build_object(
      'success',        true,
      'source',         'free',
      'free_remaining', v_free_remaining - 1
    );

  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'invalid_source', 'source', p_source);
  END IF;
END;
$$;

-- 4. Reset unlocks_count on billing renewal (called from webhook via SQL or trigger)
--    The webhook already updates current_period_start; this function upserts a fresh
--    subscription_usage row for the new period (unlocks_count starts at 0).
CREATE OR REPLACE FUNCTION public.fn_reset_subscription_usage_for_period(
  p_user_id    uuid,
  p_period_start date,
  p_period_end   date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO subscription_usage (user_id, period_start, period_end, unlocks_count, exports_count)
  VALUES (p_user_id, p_period_start, p_period_end, 0, 0)
  ON CONFLICT (user_id, period_start) DO NOTHING;
END;
$$;
