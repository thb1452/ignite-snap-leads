
-- fn_unlock_property: SECURITY DEFINER function to unlock a property
-- Checks free unlocks first, then credit balance, then rejects
CREATE OR REPLACE FUNCTION public.fn_unlock_property(
  p_user_id UUID,
  p_property_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_already_unlocked BOOLEAN;
  v_free_remaining INTEGER;
  v_credit_balance INTEGER;
  v_source TEXT;
BEGIN
  -- Enforce caller is the actual user
  IF p_user_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Check if already unlocked
  SELECT EXISTS(
    SELECT 1 FROM unlocked_properties
    WHERE user_id = p_user_id AND property_id = p_property_id
  ) INTO v_already_unlocked;

  IF v_already_unlocked THEN
    RETURN jsonb_build_object('success', true, 'source', 'already_unlocked', 'message', 'Property already unlocked');
  END IF;

  -- Check free unlocks
  SELECT free_unlocks_remaining INTO v_free_remaining
  FROM profiles WHERE user_id = p_user_id;

  IF v_free_remaining IS NOT NULL AND v_free_remaining > 0 THEN
    -- Use free unlock
    UPDATE profiles SET free_unlocks_remaining = free_unlocks_remaining - 1
    WHERE user_id = p_user_id;

    INSERT INTO unlocked_properties (user_id, property_id, credit_cost, unlock_source)
    VALUES (p_user_id, p_property_id, 0, 'free_credit');

    RETURN jsonb_build_object(
      'success', true,
      'source', 'free_credit',
      'free_remaining', v_free_remaining - 1
    );
  END IF;

  -- Check credit balance (from v_user_credits view)
  SELECT COALESCE(balance, 0) INTO v_credit_balance
  FROM v_user_credits WHERE user_id = p_user_id;

  IF v_credit_balance >= 1 THEN
    -- Deduct 1 credit via ledger
    INSERT INTO credit_ledger (user_id, delta, reason, property_id_extracted, meta)
    VALUES (p_user_id, -1, 'property_unlock', p_property_id,
            jsonb_build_object('property_id', p_property_id));

    INSERT INTO unlocked_properties (user_id, property_id, credit_cost, unlock_source)
    VALUES (p_user_id, p_property_id, 1, 'credit_pack');

    RETURN jsonb_build_object(
      'success', true,
      'source', 'credit_pack',
      'credits_remaining', v_credit_balance - 1
    );
  END IF;

  -- No free unlocks or credits available
  RETURN jsonb_build_object(
    'success', false,
    'error', 'insufficient_balance',
    'free_remaining', COALESCE(v_free_remaining, 0),
    'credits', COALESCE(v_credit_balance, 0)
  );
END;
$$;

-- fn_check_unlocked_batch: Returns which properties are unlocked for a user
CREATE OR REPLACE FUNCTION public.fn_check_unlocked_batch(
  p_user_id UUID,
  p_property_ids UUID[]
)
RETURNS TABLE(property_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT up.property_id
  FROM unlocked_properties up
  WHERE up.user_id = p_user_id
    AND up.property_id = ANY(p_property_ids);
$$;

-- fn_record_view: Increments daily view count with lazy reset
CREATE OR REPLACE FUNCTION public.fn_record_view(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_reset_at TIMESTAMPTZ;
  v_limit INTEGER := 10;
BEGIN
  IF p_user_id != auth.uid() THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT daily_view_count, daily_view_reset_at
  INTO v_count, v_reset_at
  FROM profiles WHERE user_id = p_user_id;

  -- Lazy daily reset: if last reset was before today, reset counter
  IF v_reset_at < date_trunc('day', now()) THEN
    UPDATE profiles
    SET daily_view_count = 1, daily_view_reset_at = now()
    WHERE user_id = p_user_id;
    RETURN jsonb_build_object('view_count', 1, 'limit', v_limit, 'limit_reached', false);
  END IF;

  -- Increment
  UPDATE profiles
  SET daily_view_count = daily_view_count + 1
  WHERE user_id = p_user_id;

  v_count := COALESCE(v_count, 0) + 1;

  RETURN jsonb_build_object(
    'view_count', v_count,
    'limit', v_limit,
    'limit_reached', v_count >= v_limit
  );
END;
$$;

-- fn_get_unlock_count: Returns how many users have unlocked a property (for scarcity badges)
CREATE OR REPLACE FUNCTION public.fn_get_unlock_count(p_property_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER FROM unlocked_properties WHERE property_id = p_property_id;
$$;
