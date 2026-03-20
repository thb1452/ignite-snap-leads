CREATE OR REPLACE FUNCTION public.fn_unlock_property(p_user_id UUID, p_property_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_already_unlocked BOOLEAN;
  v_free_remaining INTEGER;
  v_credit_balance INTEGER;
BEGIN
  -- Check if already unlocked (idempotent)
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

  -- Check credit balance
  SELECT COALESCE(balance, 0) INTO v_credit_balance
  FROM v_user_credits WHERE user_id = p_user_id;

  IF v_credit_balance >= 1 THEN
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

  -- No balance
  RETURN jsonb_build_object(
    'success', false,
    'error', 'insufficient_balance',
    'free_remaining', COALESCE(v_free_remaining, 0),
    'credits', COALESCE(v_credit_balance, 0)
  );
END;
$$;