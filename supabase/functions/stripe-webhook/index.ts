// Supabase Edge Function: Stripe Webhook Handler
// Route: POST /stripe-webhook (called by Stripe)
// Features: Idempotency, subscriptions, one-time payments (unlocks + credit packs), affiliate commissions

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { resolvePlanFromStripeSubscription } from "../_shared/stripeSubscriptionPlan.ts";

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    // ---- Env ----
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!supabaseUrl || !supabaseKey || !stripeKey || !webhookSecret) {
      throw new Error("SERVER_MISCONFIGURED");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const stripe = new Stripe(stripeKey, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // ---- Verify Webhook Signature ----
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return new Response(JSON.stringify({ error: "No signature" }), { status: 400 });
    }

    const body = await req.text();
    let event: Stripe.Event;

    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } catch (err: any) {
      console.error("[webhook] Signature verification failed:", err.message);
      return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 400 });
    }

    console.log("[webhook] Received event:", event.type, event.id);

    // ---- Helper: log webhook errors ----
    async function logWebhookError(
      eventType: string | null,
      eventId: string | null,
      errorMessage: string,
      payload: any,
    ) {
      try {
        await supabase.from("webhook_errors").insert({
          webhook_type: "stripe",
          event_type: eventType,
          event_id: eventId,
          error_message: errorMessage.slice(0, 2000),
          payload,
        });
      } catch {
        /* silent */
      }
    }

    // ---- Idempotency Check ----
    const { data: existingEvent } = await supabase
      .from("webhook_events")
      .select("id")
      .eq("event_id", event.id)
      .maybeSingle();

    if (existingEvent) {
      console.log("[webhook] Event already processed, skipping:", event.id);
      return new Response(JSON.stringify({ received: true, skipped: true }), { status: 200 });
    }

    const { error: insertError } = await supabase.from("webhook_events").insert({
      event_id: event.id,
      event_type: event.type,
      payload: event.data.object,
    });

    if (insertError) {
      if (insertError.code === "23505") {
        console.log("[webhook] Event being processed by another request:", event.id);
        return new Response(JSON.stringify({ received: true, skipped: true }), { status: 200 });
      }
      console.error("[webhook] Failed to record event:", insertError);
    }

    // ---- Handle Event ----
    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          await handleCheckoutCompleted(supabase, stripe, session);
          break;
        }

        case "customer.subscription.created":
        // NOTE (L-7): Stripe may fire subscription.created and subscription.updated
        // in rapid succession for the same subscription (e.g. after checkout). Both
        // call handleSubscriptionChange, which does a blind UPDATE by stripe_subscription_id.
        // If the subscription row doesn't exist yet (checkout webhook still processing),
        // the UPDATE is a no-op — the subscription.created event is safe to be idempotent.
        // Risk is low because checkout.session.completed fires first and upserts the row,
        // but if events arrive out of order the subscription row could be orphaned until
        // the next update. Mitigation: handleSubscriptionChange could be changed to upsert
        // once handleSubscriptionCheckout fully handles the initial state.
        case "customer.subscription.updated": {
          const subscription = event.data.object as Stripe.Subscription;
          await handleSubscriptionChange(supabase, stripe, subscription);
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          await handleSubscriptionDeleted(supabase, subscription);
          break;
        }

        case "customer.subscription.trial_will_end": {
          const subscription = event.data.object as Stripe.Subscription;
          console.log("[webhook] Trial will end soon for subscription:", subscription.id);
          break;
        }

        case "invoice.payment_succeeded":
        case "invoice.paid": {
          const invoice = event.data.object as Stripe.Invoice;
          await handlePaymentSucceeded(supabase, stripe, invoice);
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          await handlePaymentFailed(supabase, invoice);
          break;
        }

        default:
          console.log("[webhook] Unhandled event type:", event.type);
      }
    } catch (handlerErr: any) {
      console.error("[webhook] Handler error for", event.type, handlerErr?.message);
      await logWebhookError(event.type, event.id, handlerErr?.message ?? String(handlerErr), event.data.object);
      throw handlerErr;
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (e: any) {
    console.error("[webhook] error", e?.message ?? e);
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supabaseUrl && supabaseKey) {
        const sb = createClient(supabaseUrl, supabaseKey);
        await sb.from("webhook_errors").insert({
          webhook_type: "stripe",
          event_type: null,
          event_id: null,
          error_message: (e?.message ?? String(e)).slice(0, 2000),
          payload: { raw_error: true },
        });
      }
    } catch {
      /* silent */
    }
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});

// ---- Event Handlers ----

function paymentIntentIdFromSession(session: Stripe.Checkout.Session): string | null {
  const pi = session.payment_intent;
  if (typeof pi === "string") return pi;
  if (pi && typeof pi === "object" && "id" in pi) return (pi as Stripe.PaymentIntent).id;
  return null;
}

async function handleCheckoutCompleted(supabase: any, stripe: Stripe, session: Stripe.Checkout.Session) {
  console.log("[webhook] Checkout completed:", session.id, "mode:", session.mode);

  // Route based on mode
  if (session.mode === "payment") {
    let fullSession = session;
    if (!paymentIntentIdFromSession(session)) {
      try {
        fullSession = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ["payment_intent"],
        });
      } catch (e: any) {
        console.error("[webhook] Failed to retrieve checkout session:", e?.message ?? e);
      }
    }
    await handleOneTimePayment(supabase, fullSession);
  } else if (session.mode === "subscription") {
    await handleSubscriptionCheckout(supabase, stripe, session);
  }
}

// ---- One-Time Payment Handler (single unlock + credit packs) ----

async function handleOneTimePayment(supabase: any, session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id;
  const checkoutType = session.metadata?.checkout_type;
  const paymentIntentId = paymentIntentIdFromSession(session);

  if (!userId || !checkoutType) {
    console.error("[webhook] Missing metadata in one-time payment session");
    return;
  }

  console.log("[webhook] One-time payment:", checkoutType, "user:", userId);

  // Record transaction (skip if no payment_intent id — e.g. expanded object edge cases)
  const { error: txError } = paymentIntentId
    ? await supabase.from("transactions").insert({
        user_id: userId,
        stripe_payment_intent_id: paymentIntentId,
        amount: session.amount_total ?? 0,
        description:
          checkoutType === "single_unlock"
            ? "Single Property Unlock"
            : `Credit Pack: ${session.metadata?.credits ?? 0} credits`,
        metadata: session.metadata,
        status: "succeeded",
      })
    : { error: null as any };

  if (txError) {
    console.error("[webhook] Error recording transaction:", txError);
    // Don't throw — continue with fulfillment
  }

  if (checkoutType === "single_unlock") {
    const propertyId = session.metadata?.property_id;
    if (!propertyId) {
      console.error("[webhook] Missing property_id for single unlock");
      return;
    }

    // Check if already unlocked (idempotency)
    const { data: existing } = await supabase
      .from("unlocked_properties")
      .select("id")
      .eq("user_id", userId)
      .eq("property_id", propertyId)
      .maybeSingle();

    if (!existing) {
      const { error: unlockErr } = await supabase.from("unlocked_properties").insert({
        user_id: userId,
        property_id: propertyId,
        credit_cost: 0, // Paid directly via Stripe
        unlock_source: "paid_unlock",
      });

      if (unlockErr) {
        console.error("[webhook] Error unlocking property:", unlockErr);
        throw unlockErr;
      }

      console.log("[webhook] Property unlocked via payment:", propertyId);
    }
  } else if (checkoutType === "bulk_credits") {
    // checkout-session sends checkout_type="bulk_credits" and credit_count="5000|10000|20000"
    const credits = parseInt(session.metadata?.credit_count ?? "0", 10);
    if (credits <= 0) {
      console.error("[webhook] Invalid credits amount for bulk_credits pack");
      return;
    }

    // Add credits via ledger
    const { error: creditErr } = await supabase.from("credit_ledger").insert({
      user_id: userId,
      delta: credits,
      reason: "credit_pack_purchase",
      meta: {
        stripe_session_id: session.id,
        payment_intent_id: paymentIntentId,
        credit_count: credits,
      },
    });

    if (creditErr) {
      console.error("[webhook] Error adding credits:", creditErr);
      throw creditErr;
    }

    console.log("[webhook] Bulk credits added:", credits, "for user:", userId);
  }

  // ---- Affiliate Commission ----
  await recordAffiliateCommission(supabase, userId, session.amount_total ?? 0, paymentIntentId);
}

// ---- Subscription Checkout Handler (existing logic, extracted) ----
async function handleSubscriptionCheckout(supabase: any, stripe: Stripe, session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id;
  const customerId = session.customer as string;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  const isTrial = session.metadata?.is_trial === "true";

  if (!userId || !subscriptionId || !customerId) {
    console.error(
      "[webhook] Missing checkout fields:",
      JSON.stringify({ has_user_id: !!userId, has_subscription_id: !!subscriptionId, has_customer: !!customerId }),
    );
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const fromStripe = await resolvePlanFromStripeSubscription(supabase, subscription);
  let planId: string | null = fromStripe?.planId ?? null;

  if (fromStripe) {
    console.log(
      "[webhook] checkout.session.completed: plan from Stripe line items",
      JSON.stringify({
        plan_id: fromStripe.planId,
        price_id: fromStripe.priceId,
        source: fromStripe.source,
        plan_name: fromStripe.planName,
      }),
    );
  }

  if (!planId && session.metadata?.plan_id) {
    let metaPlan = session.metadata.plan_id as string;
    if (!UUID_RE.test(metaPlan)) {
      const TIER_ALIAS: Record<string, string> = { elite: "enterprise" };
      const lookupName = TIER_ALIAS[metaPlan.toLowerCase()] || metaPlan.toLowerCase();
      const { data: resolved } = await supabase
        .from("subscription_plans")
        .select("id")
        .eq("name", lookupName)
        .maybeSingle();
      if (resolved?.id) {
        console.log("[webhook] checkout: fallback plan_id from metadata tier name:", metaPlan, "→", resolved.id);
        planId = resolved.id;
      } else {
        console.error("[webhook] checkout: could not resolve metadata plan_id:", metaPlan);
      }
    } else {
      planId = metaPlan;
      console.log("[webhook] checkout: fallback plan_id from metadata UUID:", planId);
    }
  }

  if (!planId) {
    console.error("[webhook] checkout: could not resolve plan_id from Stripe subscription items or metadata");
    return;
  }

  if (fromStripe && session.metadata?.plan_id) {
    const metaRaw = session.metadata.plan_id;
    if (UUID_RE.test(metaRaw) && metaRaw !== fromStripe.planId) {
      console.warn(
        "[webhook] checkout: metadata plan_id differs from Stripe price mapping; using Stripe",
        JSON.stringify({ metadata_plan_id: metaRaw, stripe_plan_id: fromStripe.planId }),
      );
    }
  }

  // Cancel any existing active/trial subscriptions
  const { error: cancelError } = await supabase
    .from("user_subscriptions")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("user_id", userId)
    .in("status", ["active", "trial", "trialing", "past_due"]);

  if (cancelError) {
    console.error("[webhook] Error cancelling old subscriptions:", cancelError);
  }

  const isTrialing = subscription.status === "trialing";
  const status = isTrialing ? "trialing" : "active";

  let trialTier: string | null = null;
  if (isTrialing || isTrial) {
    const { data: planData } = await supabase.from("subscription_plans").select("name").eq("id", planId).maybeSingle();
    trialTier = planData?.name || planId;
  }

  const subscriptionRecord: Record<string, any> = {
    user_id: userId,
    plan_id: planId,
    status,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
  };

  if (isTrialing && subscription.trial_end) {
    subscriptionRecord.trial_started_at = new Date().toISOString();
    subscriptionRecord.trial_ends_at = new Date(subscription.trial_end * 1000).toISOString();
    subscriptionRecord.trial_tier = trialTier;
    subscriptionRecord.trial_exports_used = 0;
    // NOTE (M-7): Trial export limit is 500 — not disclosed on the pricing page.
    // Update pricing copy or change this value if the trial limits change.
    subscriptionRecord.trial_exports_limit = 500;
  }

  const { error: insertError } = await supabase.from("user_subscriptions").insert(subscriptionRecord);

  if (insertError) {
    console.error("[webhook] Error creating subscription:", insertError);
    throw insertError;
  }

  try {
    const other = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 30,
    });
    for (const s of other.data) {
      if (s.id !== subscriptionId) {
        await stripe.subscriptions.cancel(s.id);
        console.log("[webhook] Cancelled duplicate Stripe subscription after checkout:", s.id);
      }
    }
  } catch (dupErr: any) {
    console.error("[webhook] Could not cancel duplicate Stripe subscriptions:", dupErr?.message ?? dupErr);
  }

  // Record affiliate commission for subscription first payment
  await recordAffiliateCommission(supabase, userId, session.amount_total ?? 0, session.payment_intent as string);

  console.log("[webhook] Subscription created for user:", userId, "status:", status, isTrialing ? "(trial)" : "");
}

// ---- Affiliate Commission Helper ----
async function recordAffiliateCommission(
  supabase: any,
  userId: string,
  amountCents: number,
  paymentIntentId: string | null,
) {
  if (!amountCents || amountCents <= 0) return;

  try {
    // Check if user was referred
    const { data: referral } = await supabase
      .from("affiliate_referrals")
      .select("id, referrer_id, first_purchase_at, signup_at")
      .eq("referred_user_id", userId)
      .maybeSingle();

    if (!referral) return; // Not a referred user

    // Check if within 12-month commission window
    const signupDate = new Date(referral.signup_at);
    const monthsSinceSignup = (Date.now() - signupDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (monthsSinceSignup > 12) {
      console.log("[webhook] Affiliate commission expired (>12 months) for user:", userId);
      return;
    }

    // Mark first purchase if not set
    if (!referral.first_purchase_at) {
      await supabase
        .from("affiliate_referrals")
        .update({ first_purchase_at: new Date().toISOString() })
        .eq("id", referral.id);
    }

    // Get or create transaction record for the commission FK
    let transactionId: string | null = null;
    if (paymentIntentId) {
      const { data: tx } = await supabase
        .from("transactions")
        .select("id")
        .eq("stripe_payment_intent_id", paymentIntentId)
        .maybeSingle();
      transactionId = tx?.id;
    }

    if (!transactionId) {
      // Create a transaction record if one doesn't exist yet
      const { data: newTx } = await supabase
        .from("transactions")
        .insert({
          user_id: userId,
          stripe_payment_intent_id: paymentIntentId,
          amount: amountCents,
          description: "Referred user payment",
          status: "succeeded",
        })
        .select("id")
        .single();
      transactionId = newTx?.id;
    }

    if (!transactionId) {
      console.error("[webhook] Could not get/create transaction for commission");
      return;
    }

    // Calculate 30% commission
    const commissionAmount = Math.round(amountCents * 0.3);

    const { error: commErr } = await supabase.from("affiliate_commissions").insert({
      referral_id: referral.id,
      transaction_id: transactionId,
      amount: commissionAmount,
      commission_rate: 30,
      status: "pending",
    });

    if (commErr) {
      console.error("[webhook] Error recording commission:", commErr);
    } else {
      console.log(
        "[webhook] Affiliate commission recorded:",
        commissionAmount,
        "cents for referrer:",
        referral.referrer_id,
      );
    }
  } catch (e: any) {
    console.error("[webhook] Affiliate commission error:", e?.message);
    // Non-critical — don't throw
  }
}

async function handleSubscriptionChange(supabase: any, stripe: Stripe, subscription: Stripe.Subscription) {
  console.log("[webhook] Subscription changed:", subscription.id, "stripe_status:", subscription.status);

  let userId = subscription.metadata?.user_id;

  if (!userId) {
    const { data: existingSub } = await supabase
      .from("user_subscriptions")
      .select("user_id")
      .eq("stripe_subscription_id", subscription.id)
      .maybeSingle();

    if (existingSub?.user_id) {
      userId = existingSub.user_id;
      console.log("[webhook] Resolved user_id from database:", userId);
    } else {
      if (subscription.customer) {
        const customer = await stripe.customers.retrieve(subscription.customer as string);
        if (customer && !customer.deleted && customer.metadata?.supabase_user_id) {
          userId = customer.metadata.supabase_user_id;
          console.log("[webhook] Resolved user_id from customer metadata:", userId);
        }
      }
    }
  }

  if (!userId) {
    console.error("[webhook] No user_id found for subscription:", subscription.id);
    return;
  }

  let status = "active";
  if (subscription.status === "trialing") status = "trialing";
  else if (subscription.status === "canceled") status = "cancelled";
  else if (subscription.status === "past_due") status = "past_due";
  else if (subscription.status === "unpaid") status = "cancelled";
  else if (subscription.status === "incomplete_expired") status = "cancelled";
  else if (subscription.cancel_at_period_end) status = "active";

  const updatePayload: Record<string, any> = {
    status,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    cancel_at: subscription.cancel_at ? new Date(subscription.cancel_at * 1000).toISOString() : null,
  };

  const planResolved = await resolvePlanFromStripeSubscription(supabase, subscription);
  if (planResolved) {
    updatePayload.plan_id = planResolved.planId;
    console.log(
      "[webhook] customer.subscription.*: plan_id sync",
      JSON.stringify({
        stripe_subscription_id: subscription.id,
        plan_id: planResolved.planId,
        price_id: planResolved.priceId,
        source: planResolved.source,
        plan_name: planResolved.planName,
      }),
    );
  } else {
    console.warn(
      "[webhook] customer.subscription.*: no price→plan mapping; plan_id not updated from Stripe",
      subscription.id,
    );
  }

  if (subscription.status === "active") {
    const { data: currentSub } = await supabase
      .from("user_subscriptions")
      .select("status, trial_started_at")
      .eq("stripe_subscription_id", subscription.id)
      .maybeSingle();

    if (currentSub?.status === "trialing" && currentSub?.trial_started_at) {
      console.log("[webhook] Trial → Active conversion for user:", userId);
      updatePayload.trial_exports_used = 0;
    }
  }

  if (subscription.status === "trialing" && subscription.trial_end) {
    updatePayload.trial_ends_at = new Date(subscription.trial_end * 1000).toISOString();
  }

  const { data: updatedRows, error } = await supabase
    .from("user_subscriptions")
    .update(updatePayload)
    .eq("stripe_subscription_id", subscription.id)
    .select("id, user_id, plan_id");

  if (error) {
    console.error("[webhook] Error updating subscription:", error);
    throw error;
  }

  if (!updatedRows?.length) {
    console.error(
      "[webhook] subscription.update matched 0 DB rows (checkout may not have inserted yet):",
      subscription.id,
    );
  } else {
    console.log(
      "[webhook] Subscription row updated:",
      JSON.stringify({ user_id: userId, status, db_row: updatedRows[0] }),
    );
  }
}

async function handleSubscriptionDeleted(supabase: any, subscription: Stripe.Subscription) {
  console.log("[webhook] Subscription deleted:", subscription.id);

  let userId = subscription.metadata?.user_id;

  if (!userId) {
    const { data: existingSub } = await supabase
      .from("user_subscriptions")
      .select("user_id")
      .eq("stripe_subscription_id", subscription.id)
      .maybeSingle();

    if (existingSub?.user_id) {
      userId = existingSub.user_id;
    }
  }

  const { error } = await supabase
    .from("user_subscriptions")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id);

  if (error) {
    console.error("[webhook] Error cancelling subscription:", error);
    throw error;
  }

  console.log("[webhook] Subscription cancelled for user:", userId);
}

async function handlePaymentSucceeded(supabase: any, stripe: Stripe, invoice: Stripe.Invoice) {
  console.log("[webhook] Payment succeeded:", invoice.id);

  const subscriptionId =
    typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
  if (!subscriptionId) return;

  let stripeSub: Stripe.Subscription;
  try {
    stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
  } catch (e: any) {
    console.error("[webhook] Could not retrieve subscription for invoice:", subscriptionId, e?.message);
    return;
  }

  const planResolved = await resolvePlanFromStripeSubscription(supabase, stripeSub);

  const updatePayload: Record<string, any> = { status: "active" };
  if (planResolved) {
    updatePayload.plan_id = planResolved.planId;
    console.log(
      "[webhook] invoice paid: plan sync",
      JSON.stringify({
        stripe_subscription_id: subscriptionId,
        plan_id: planResolved.planId,
        price_id: planResolved.priceId,
        source: planResolved.source,
      }),
    );
  }

  if (invoice.period_start && invoice.period_end) {
    updatePayload.current_period_start = new Date(invoice.period_start * 1000).toISOString();
    updatePayload.current_period_end = new Date(invoice.period_end * 1000).toISOString();
    console.log(
      "[webhook] Updating billing period for subscription:", subscriptionId,
      "new period:", updatePayload.current_period_start, "→", updatePayload.current_period_end,
    );
  } else {
    updatePayload.current_period_start = new Date(stripeSub.current_period_start * 1000).toISOString();
    updatePayload.current_period_end = new Date(stripeSub.current_period_end * 1000).toISOString();
  }

  const { data: invUpdated, error } = await supabase
    .from("user_subscriptions")
    .update(updatePayload)
    .eq("stripe_subscription_id", subscriptionId)
    .select("id, plan_id");

  if (error) {
    console.error("[webhook] Error updating subscription after payment:", error);
  } else if (!invUpdated?.length) {
    console.warn("[webhook] invoice payment: no user_subscriptions row for", subscriptionId);
  }

  // M-8: Allocate monthly credits to credit_ledger for subscription renewals.
  // Subscribers use fn_unlock_property which draws from credit_ledger, so they
  // need credits allocated each billing cycle.
  // Skip the very first invoice (billing_reason === "subscription_create") because
  // handleSubscriptionCheckout already upserts the subscription row and the user
  // hasn't used any credits yet. Only allocate on renewals and cycle changes.
  if (invoice.billing_reason === "subscription_create") {
    console.log("[webhook] Skipping credit allocation for new subscription:", subscriptionId);
    return;
  }

  // Look up the user's active subscription to get plan credits
  const { data: subRow } = await supabase
    .from("user_subscriptions")
    .select("user_id, plan:subscription_plans(max_monthly_exports)")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  if (!subRow?.user_id) {
    console.error("[webhook] Could not find subscription row for credit allocation:", subscriptionId);
    return;
  }

  const monthlyCredits: number = (subRow.plan as any)?.max_monthly_exports ?? 0;
  if (monthlyCredits <= 0) {
    console.log("[webhook] No credits to allocate for subscription:", subscriptionId);
    return;
  }

  const { error: creditErr } = await supabase.from("credit_ledger").insert({
    user_id: subRow.user_id,
    delta: monthlyCredits,
    reason: "subscription_renewal",
    meta: {
      stripe_subscription_id: subscriptionId,
      stripe_invoice_id: invoice.id,
      billing_reason: invoice.billing_reason,
      period_start: updatePayload.current_period_start,
      period_end: updatePayload.current_period_end,
    },
  });

  if (creditErr) {
    console.error("[webhook] Error allocating monthly credits:", creditErr);
  } else {
    console.log("[webhook] Allocated", monthlyCredits, "monthly credits to user:", subRow.user_id);
  }
}

async function handlePaymentFailed(supabase: any, invoice: Stripe.Invoice) {
  console.log("[webhook] Payment failed:", invoice.id);

  const subscriptionId = invoice.subscription as string;
  if (!subscriptionId) return;

  const { error } = await supabase
    .from("user_subscriptions")
    .update({ status: "past_due" })
    .eq("stripe_subscription_id", subscriptionId);

  if (error) {
    console.error("[webhook] Error updating subscription after failed payment:", error);
  }
}
