-- Candidate: atomic billing synchronization. Does not modify historical balances or statuses.
-- Deployment must stop for duplicate subscription identities; review them, never auto-delete.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE SCHEMA IF NOT EXISTS snap_billing;
REVOKE ALL ON SCHEMA snap_billing FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA snap_billing TO service_role;

CREATE SEQUENCE snap_billing.sync_versions;
GRANT USAGE ON SEQUENCE snap_billing.sync_versions TO service_role;
CREATE TABLE snap_billing.release_controls (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  checkout_enabled boolean NOT NULL DEFAULT false,
  fulfillment_verified_at timestamptz,
  approval_reference text,
  CHECK (NOT checkout_enabled OR (fulfillment_verified_at IS NOT NULL AND length(approval_reference)>0))
);
INSERT INTO snap_billing.release_controls(singleton) VALUES(true);
CREATE TABLE snap_billing.events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE snap_billing.receipts (
  receipt_key text PRIMARY KEY,
  user_id uuid NOT NULL,
  kind text NOT NULL,
  amount integer NOT NULL CHECK(amount >= 0),
  currency text NOT NULL,
  payment_intent_id text,
  subscription_id text,
  transaction_id uuid REFERENCES public.transactions(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX billing_receipts_payment_identity ON snap_billing.receipts(payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;
CREATE TABLE snap_billing.account_closures (
  user_id uuid PRIMARY KEY,
  status text NOT NULL CHECK(status IN ('cancellation_requested','cancellation_failed','pending_retention_review')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE snap_billing.account_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE snap_billing.release_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE snap_billing.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE snap_billing.receipts ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA snap_billing TO service_role;
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS stripe_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_sync_version bigint,
  ADD COLUMN IF NOT EXISTS stripe_status text,
  ADD COLUMN IF NOT EXISTS paid_through timestamptz;
DO $preflight$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_subscriptions WHERE stripe_subscription_id IS NOT NULL
    GROUP BY stripe_subscription_id HAVING count(*)>1) THEN
    RAISE EXCEPTION 'billing_duplicate_subscription_ids: manual reconciliation required';
  END IF;
END $preflight$;
CREATE UNIQUE INDEX IF NOT EXISTS user_subscriptions_stripe_id_unique
  ON public.user_subscriptions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

CREATE FUNCTION public.fn_begin_billing_sync_v1() RETURNS bigint
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
  SELECT nextval('snap_billing.sync_versions');
$fn$;
REVOKE ALL ON FUNCTION public.fn_begin_billing_sync_v1() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_begin_billing_sync_v1() TO service_role;

CREATE FUNCTION public.fn_billing_checkout_enabled_v1() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
  SELECT coalesce((SELECT checkout_enabled AND fulfillment_verified_at IS NOT NULL
    AND length(approval_reference)>0 FROM snap_billing.release_controls WHERE singleton),false);
$fn$;
REVOKE ALL ON FUNCTION public.fn_billing_checkout_enabled_v1() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_billing_checkout_enabled_v1() TO service_role;

CREATE FUNCTION public.fn_billing_account_open_v1(p_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
  SELECT p_user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM snap_billing.account_closures WHERE user_id=p_user_id);
$fn$;
REVOKE ALL ON FUNCTION public.fn_billing_account_open_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_billing_account_open_v1(uuid) TO service_role;

CREATE FUNCTION public.fn_apply_billing_event_v1(p_event jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE
  s jsonb := p_event->'subscription'; pay jsonb:=p_event->'payment'; inv jsonb:=p_event->'invoice';
  u uuid; sub public.user_subscriptions%ROWTYPE;
  observed timestamptz; paid_end timestamptz; effective_end timestamptz; local_status text;
  receipt text; payment_intent text; amount_cents integer; currency_code text; kind text;
  tx uuid; referral public.affiliate_referrals%ROWTYPE; v_event_id text:=nullif(p_event->>'event_id','');
  duplicate_receipt boolean:=false;
BEGIN
  IF v_event_id IS NULL OR nullif(p_event->>'event_type','') IS NULL THEN RAISE EXCEPTION 'billing_event_identity_required'; END IF;
  -- Serialize event identity, then customer identity. Both locks live for this transaction.
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-event:'||v_event_id,0));
  IF EXISTS(SELECT 1 FROM snap_billing.events e WHERE e.event_id=v_event_id)
    OR EXISTS(SELECT 1 FROM public.webhook_events e WHERE e.event_id=v_event_id) THEN
    RETURN jsonb_build_object('duplicate',true);
  END IF;
  u:=coalesce(s->>'user_id',pay->>'user_id',inv->>'user_id')::uuid;
  IF u IS NULL THEN RAISE EXCEPTION 'billing_user_required'; END IF;
  IF (s IS NOT NULL AND (s->>'user_id')::uuid<>u) OR (pay IS NOT NULL AND (pay->>'user_id')::uuid<>u)
    OR (inv IS NOT NULL AND (inv->>'user_id')::uuid<>u) THEN RAISE EXCEPTION 'billing_owner_conflict'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-user:'||u::text,0));
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=u) THEN RAISE EXCEPTION 'billing_user_missing'; END IF;

  IF s IS NOT NULL THEN
    IF nullif(s->>'subscription_id','') IS NULL OR nullif(s->>'customer_id','') IS NULL
      OR nullif(s->>'plan_id','') IS NULL OR nullif(s->>'observed_at','') IS NULL OR nullif(s->>'sync_version','') IS NULL THEN
      RAISE EXCEPTION 'billing_subscription_invalid'; END IF;
    observed:=(s->>'observed_at')::timestamptz;
    SELECT * INTO sub FROM public.user_subscriptions WHERE stripe_subscription_id=s->>'subscription_id' FOR UPDATE;
    IF sub.id IS NOT NULL AND sub.user_id<>u THEN RAISE EXCEPTION 'billing_subscription_owner_conflict'; END IF;
    -- Stripe terminal states cannot be resumed for this subscription identity.
    -- A slower lower-ticket fetch may still observe the later cancellation.
    IF (s->>'stripe_status' IN ('canceled','incomplete_expired') OR sub.id IS NULL OR sub.stripe_sync_version IS NULL
      OR (s->>'sync_version')::bigint>sub.stripe_sync_version)
      AND NOT (coalesce(sub.stripe_status,'') IN ('canceled','incomplete_expired')
        AND s->>'stripe_status' NOT IN ('canceled','incomplete_expired')) THEN
      IF sub.id IS NOT NULL AND sub.plan_id<>(s->>'plan_id')::uuid AND s->>'stripe_status'='active'
        AND NOT coalesce((s->>'paid_plan_verified')::boolean,false) THEN
        RAISE EXCEPTION 'billing_plan_change_unpaid';
      END IF;
      paid_end:=greatest(sub.paid_through,(s->>'paid_through')::timestamptz);
      local_status:=CASE s->>'stripe_status'
        WHEN 'trialing' THEN 'trialing' WHEN 'active' THEN 'active'
        WHEN 'past_due' THEN 'past_due' WHEN 'unpaid' THEN 'unpaid' ELSE 'cancelled' END;
      effective_end:=CASE WHEN local_status='trialing' THEN (s->>'trial_end')::timestamptz
        ELSE least((s->>'period_end')::timestamptz,paid_end) END;
      -- No fabricated 30-day fallback and no access granted from an unpaid future period.
      IF local_status='active' AND (paid_end IS NULL OR effective_end<=now()) THEN local_status:='unpaid'; END IF;
      IF local_status='trialing' AND (effective_end IS NULL OR effective_end<=now()) THEN local_status:='unpaid'; END IF;
      IF local_status<>'cancelled' AND EXISTS(SELECT 1 FROM public.user_subscriptions x
        WHERE x.user_id=u AND x.status<>'cancelled' AND x.stripe_subscription_id IS DISTINCT FROM s->>'subscription_id') THEN
        RAISE EXCEPTION 'billing_multiple_subscriptions_review';
      END IF;
      IF sub.id IS NULL THEN
        INSERT INTO public.user_subscriptions(user_id,plan_id,status,stripe_customer_id,stripe_subscription_id,
          current_period_start,current_period_end,trial_started_at,trial_ends_at,trial_tier,
          trial_exports_used,trial_exports_limit,cancel_at,cancelled_at,stripe_sync_at,stripe_sync_version,stripe_status,paid_through)
        VALUES(u,(s->>'plan_id')::uuid,local_status,s->>'customer_id',s->>'subscription_id',
          (s->>'period_start')::timestamptz,effective_end,(s->>'trial_start')::timestamptz,
          (s->>'trial_end')::timestamptz,CASE WHEN s->>'trial_start' IS NOT NULL THEN s->>'plan_name' END,
          0,500,(s->>'cancel_at')::timestamptz,(s->>'cancelled_at')::timestamptz,observed,(s->>'sync_version')::bigint,s->>'stripe_status',paid_end);
      ELSE
        UPDATE public.user_subscriptions SET plan_id=(s->>'plan_id')::uuid,status=local_status,
          stripe_customer_id=s->>'customer_id',current_period_start=(s->>'period_start')::timestamptz,
          current_period_end=effective_end,trial_started_at=coalesce(sub.trial_started_at,(s->>'trial_start')::timestamptz),
          trial_ends_at=(s->>'trial_end')::timestamptz,
          cancel_at=(s->>'cancel_at')::timestamptz,cancelled_at=(s->>'cancelled_at')::timestamptz,
          stripe_sync_at=observed,stripe_sync_version=greatest(sub.stripe_sync_version,(s->>'sync_version')::bigint),stripe_status=s->>'stripe_status',paid_through=paid_end WHERE id=sub.id;
        -- Usage and allowance counters are deliberately absent from this UPDATE.
      END IF;
    END IF;
  END IF;

  IF pay IS NOT NULL OR inv IS NOT NULL THEN
    kind:=coalesce(pay->>'kind','subscription_invoice');
    IF pay IS NOT NULL THEN
      IF kind NOT IN ('bulk_credits','single_unlock') OR nullif(pay->>'session_id','') IS NULL
        OR nullif(pay->>'payment_intent_id','') IS NULL THEN RAISE EXCEPTION 'billing_payment_invalid'; END IF;
      IF kind='bulk_credits' AND (pay->>'credits')::integer NOT IN (5000,10000,20000) THEN RAISE EXCEPTION 'billing_pack_invalid'; END IF;
      -- Keep the current privacy/fulfillment hold; accepting payment never releases property data.
      IF kind='single_unlock' THEN RAISE EXCEPTION 'customer_access_held'; END IF;
      receipt:='checkout:'||(pay->>'session_id');
    ELSE
      IF nullif(inv->>'invoice_id','') IS NULL THEN RAISE EXCEPTION 'billing_invoice_invalid'; END IF;
      receipt:='invoice:'||(inv->>'invoice_id');
    END IF;
    amount_cents:=(coalesce(pay,inv)->>'amount')::integer;
    currency_code:=coalesce(pay,inv)->>'currency';
    payment_intent:=coalesce(pay,inv)->>'payment_intent_id';
    IF amount_cents IS NULL OR amount_cents<0 OR currency_code IS NULL THEN RAISE EXCEPTION 'billing_amount_invalid'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('billing-receipt:'||receipt,0));
    IF EXISTS(SELECT 1 FROM snap_billing.receipts r WHERE r.receipt_key=receipt AND (r.user_id<>u OR r.amount<>amount_cents OR r.currency<>currency_code)) THEN
      RAISE EXCEPTION 'billing_receipt_conflict'; END IF;
    duplicate_receipt:=EXISTS(SELECT 1 FROM snap_billing.receipts r WHERE r.receipt_key=receipt);
    IF NOT duplicate_receipt THEN
      IF payment_intent IS NOT NULL THEN
        SELECT id INTO tx FROM public.transactions WHERE stripe_payment_intent_id=payment_intent;
        IF tx IS NOT NULL AND EXISTS(SELECT 1 FROM public.transactions t WHERE t.id=tx AND (t.user_id<>u OR t.amount<>amount_cents OR t.currency<>currency_code)) THEN
          RAISE EXCEPTION 'billing_transaction_conflict'; END IF;
      END IF;
      IF tx IS NULL THEN
        INSERT INTO public.transactions(user_id,stripe_payment_intent_id,amount,currency,description,status,metadata)
          VALUES(u,payment_intent,amount_cents,currency_code,kind,'succeeded',jsonb_build_object('receipt_key',receipt)) RETURNING id INTO tx;
      END IF;
      IF kind='bulk_credits' AND NOT EXISTS(SELECT 1 FROM public.credit_ledger l
        WHERE l.user_id=u AND l.reason='credit_pack_purchase' AND l.meta->>'stripe_session_id'=pay->>'session_id') THEN
        INSERT INTO public.credit_ledger(user_id,delta,reason,meta) VALUES(u,(pay->>'credits')::integer,'credit_pack_purchase',
          jsonb_build_object('stripe_session_id',pay->>'session_id','payment_intent_id',payment_intent,'credit_count',(pay->>'credits')::integer));
      END IF;
      -- Subscription invoices only establish a period allowance. Never deposit a second wallet allowance.
      SELECT * INTO referral FROM public.affiliate_referrals WHERE referred_user_id=u FOR UPDATE;
      IF amount_cents>0 AND referral.id IS NOT NULL AND referral.signup_at>=now()-interval '12 months'
        AND NOT EXISTS(SELECT 1 FROM public.affiliate_commissions WHERE referral_id=referral.id AND transaction_id=tx) THEN
        INSERT INTO public.affiliate_commissions(referral_id,transaction_id,amount,commission_rate,status)
          VALUES(referral.id,tx,round(amount_cents*0.30),30,'pending');
        UPDATE public.affiliate_referrals SET first_purchase_at=coalesce(first_purchase_at,now()) WHERE id=referral.id;
      END IF;
      INSERT INTO snap_billing.receipts(receipt_key,user_id,kind,amount,currency,payment_intent_id,subscription_id,transaction_id)
        VALUES(receipt,u,kind,amount_cents,currency_code,payment_intent,inv->>'subscription_id',tx);
    END IF;
  END IF;
  INSERT INTO snap_billing.events(event_id,event_type) VALUES(v_event_id,p_event->>'event_type');
  RETURN jsonb_build_object('processed',true,'duplicate_receipt',duplicate_receipt,'receipt_key',receipt);
END;
$fn$;
REVOKE ALL ON FUNCTION public.fn_apply_billing_event_v1(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_apply_billing_event_v1(jsonb) TO service_role;
GRANT SELECT ON public.webhook_events,auth.users TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.user_subscriptions,public.transactions,public.credit_ledger,
  public.affiliate_referrals,public.affiliate_commissions TO service_role;
CREATE FUNCTION public.fn_record_account_closure_v1(p_user_id uuid,p_status text) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
  INSERT INTO snap_billing.account_closures(user_id,status) VALUES(p_user_id,p_status)
    ON CONFLICT(user_id) DO UPDATE SET status=EXCLUDED.status,updated_at=now();
$fn$;
REVOKE ALL ON FUNCTION public.fn_record_account_closure_v1(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_record_account_closure_v1(uuid,text) TO service_role;
COMMIT;
