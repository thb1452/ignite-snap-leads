CREATE OR REPLACE FUNCTION public.fn_unlock_property(p_user_id uuid, p_property_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_already_unlocked BOOLEAN;
  v_free_remaining INTEGER;
  v_credit_balance INTEGER;
  v_plan_max INTEGER;
  v_period_start DATE;
  v_period_end DATE;
  v_new_exports INTEGER;
  v_auth_uid UUID;
BEGIN
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NOT NULL AND p_user_id <> v_auth_uid THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM unlocked_properties
    WHERE user_id = p_user_id AND property_id = p_property_id
  ) INTO v_already_unlocked;

  IF v_already_unlocked THEN
    RETURN jsonb_build_object(
      'success', true,
      'source', 'already_unlocked',
      'message', 'Property already unlocked'
    );
  END IF;

  SELECT free_unlocks_remaining INTO v_free_remaining
  FROM profiles WHERE user_id = p_user_id;

  IF v_free_remaining IS NOT NULL AND v_free_remaining > 0 THEN
    UPDATE profiles
    SET free_unlocks_remaining = free_unlocks_remaining - 1
    WHERE user_id = p_user_id;

    INSERT INTO unlocked_properties (user_id, property_id, credit_cost, unlock_source)
    VALUES (p_user_id, p_property_id, 0, 'free_credit');

    RETURN jsonb_build_object(
      'success', true,
      'source', 'free_credit',
      'free_remaining', v_free_remaining - 1,
      'credits_remaining', COALESCE((SELECT balance FROM v_user_credits WHERE user_id = p_user_id), 0)
    );
  END IF;

  SELECT COALESCE(balance, 0) INTO v_credit_balance
  FROM v_user_credits WHERE user_id = p_user_id;

  IF v_credit_balance >= 1 THEN
    INSERT INTO credit_ledger (user_id, delta, reason, meta)
    VALUES (p_user_id, -1, 'property_unlock',
            jsonb_build_object('property_id', p_property_id));

    INSERT INTO unlocked_properties (user_id, property_id, credit_cost, unlock_source)
    VALUES (p_user_id, p_property_id, 1, 'credit_pack');

    RETURN jsonb_build_object(
      'success', true,
      'source', 'credit_pack',
      'credits_remaining', v_credit_balance - 1
    );
  END IF;

  SELECT sp.max_monthly_exports, us.current_period_start::date, us.current_period_end::date
  INTO v_plan_max, v_period_start, v_period_end
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = p_user_id
    AND us.status IN ('active', 'trialing', 'trial', 'past_due')
  ORDER BY us.created_at DESC
  LIMIT 1;

  IF v_plan_max IS NOT NULL THEN
    IF v_period_start IS NULL THEN
      v_period_start := date_trunc('month', CURRENT_DATE)::date;
      v_period_end := (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date;
    END IF;

    INSERT INTO subscription_usage (user_id, period_start, period_end)
    VALUES (p_user_id, v_period_start, v_period_end)
    ON CONFLICT (user_id, period_start) DO NOTHING;

    UPDATE subscription_usage
    SET exports_count = exports_count + 1, updated_at = NOW()
    WHERE user_id = p_user_id
      AND period_start = v_period_start
      AND (v_plan_max = -1 OR exports_count + 1 <= v_plan_max)
    RETURNING exports_count INTO v_new_exports;

    IF v_new_exports IS NOT NULL THEN
      INSERT INTO unlocked_properties (user_id, property_id, credit_cost, unlock_source)
      VALUES (p_user_id, p_property_id, 0, 'subscription');

      RETURN jsonb_build_object(
        'success', true,
        'source', 'subscription',
        'subscription_remaining', CASE
          WHEN v_plan_max = -1 THEN NULL
          ELSE v_plan_max - v_new_exports
        END,
        'credits_remaining', COALESCE(v_credit_balance, 0)
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', false,
    'error', 'insufficient_balance',
    'free_remaining', COALESCE(v_free_remaining, 0),
    'credits', COALESCE(v_credit_balance, 0),
    'subscription_remaining', COALESCE(
      (
        SELECT CASE
          WHEN sp.max_monthly_exports = -1 THEN NULL::integer
          ELSE GREATEST(0, sp.max_monthly_exports - COALESCE(su.exports_count, 0))
        END
        FROM user_subscriptions us
        JOIN subscription_plans sp ON sp.id = us.plan_id
        LEFT JOIN subscription_usage su
          ON su.user_id = us.user_id AND su.period_start = us.current_period_start::date
        WHERE us.user_id = p_user_id
          AND us.status IN ('active', 'trialing', 'trial', 'past_due')
        ORDER BY us.created_at DESC
        LIMIT 1
      ),
      0
    ),
    'message', 'Insufficient balance. Purchase credits or buy a single unlock to continue.'
  );
END;
$function$;

UPDATE public.credit_ledger
SET delta = 0,
    meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('corrected_at', now(), 'correction_reason', 'free_unlock_should_not_create_paid_credit')
WHERE reason = 'free_unlock_export'
  AND delta <> 0;