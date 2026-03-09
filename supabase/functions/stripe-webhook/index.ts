// Supabase Edge Function: Stripe Webhook Handler
// Route: POST /stripe-webhook (called by Stripe)
// Features: Idempotency tracking to prevent duplicate processing

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";
import Stripe from "https://esm.sh/stripe@14.21.0";

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
    async function logWebhookError(eventType: string | null, eventId: string | null, errorMessage: string, payload: any) {
      try {
        await supabase.from("webhook_errors").insert({
          webhook_type: "stripe",
          event_type: eventType,
          event_id: eventId,
          error_message: errorMessage.slice(0, 2000),
          payload,
        });
      } catch { /* silent */ }
    }

    // ---- Idempotency Check ----
    // Check if we've already processed this event
    const { data: existingEvent } = await supabase
      .from("webhook_events")
      .select("id")
      .eq("event_id", event.id)
      .maybeSingle();

    if (existingEvent) {
      console.log("[webhook] Event already processed, skipping:", event.id);
      return new Response(JSON.stringify({ received: true, skipped: true }), { status: 200 });
    }

    // Record event before processing (prevents race conditions)
    const { error: insertError } = await supabase.from("webhook_events").insert({
      event_id: event.id,
      event_type: event.type,
      payload: event.data.object,
    });

    if (insertError) {
      // Unique constraint violation means another request is processing
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
          await handleCheckoutCompleted(supabase, session);
          break;
        }

        case "customer.subscription.created":
        case "customer.subscription.updated": {
          const subscription = event.data.object as Stripe.Subscription;
          await handleSubscriptionChange(supabase, subscription);
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

        case "invoice.payment_succeeded": {
          const invoice = event.data.object as Stripe.Invoice;
          await handlePaymentSucceeded(supabase, invoice);
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
      throw handlerErr; // re-throw so Stripe retries
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (e: any) {
    console.error("[webhook] error", e?.message ?? e);
    // Log webhook processing error
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
    } catch { /* silent */ }
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});

// ---- Event Handlers ----

async function handleCheckoutCompleted(supabase: any, session: Stripe.Checkout.Session) {
  console.log("[webhook] Checkout completed:", session.id);

  const userId = session.metadata?.user_id;
  let planId = session.metadata?.plan_id;
  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;
  const isTrial = session.metadata?.is_trial === "true";

  if (!userId || !planId) {
    console.error("[webhook] Missing metadata in checkout session");
    return;
  }

  // If planId is not a UUID (e.g. "elite"), resolve it from the DB
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(planId)) {
    const TIER_ALIAS: Record<string, string> = { elite: "enterprise" };
    const lookupName = TIER_ALIAS[planId.toLowerCase()] || planId.toLowerCase();
    const { data: resolved } = await supabase
      .from("subscription_plans")
      .select("id")
      .eq("name", lookupName)
      .maybeSingle();
    if (resolved?.id) {
      console.log("[webhook] Resolved plan_id from name:", planId, "→", resolved.id);
      planId = resolved.id;
    } else {
      console.error("[webhook] Could not resolve plan_id:", planId);
      return;
    }
  }

  // Get subscription details from Stripe
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    apiVersion: "2023-10-16",
    httpClient: Stripe.createFetchHttpClient(),
  });

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  // Cancel any existing active/trial subscriptions for this user
  const { error: cancelError } = await supabase
    .from("user_subscriptions")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("user_id", userId)
    .in("status", ["active", "trial", "trialing", "past_due"]);

  if (cancelError) {
    console.error("[webhook] Error cancelling old subscriptions:", cancelError);
  }

  // Determine status and trial fields
  const isTrialing = subscription.status === "trialing";
  const status = isTrialing ? "trialing" : "active";

  // Look up the tier name from the plan_id (which might be a UUID or tier name)
  let trialTier: string | null = null;
  if (isTrialing || isTrial) {
    // Try to get tier name from subscription_plans table
    const { data: planData } = await supabase.from("subscription_plans").select("name").eq("id", planId).maybeSingle();
    trialTier = planData?.name || planId; // Fallback to planId if it's already the tier name
  }

  // Build subscription record
  const subscriptionRecord: Record<string, any> = {
    user_id: userId,
    plan_id: planId,
    status,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
  };

  // Set trial fields if this is a trial subscription
  if (isTrialing && subscription.trial_end) {
    subscriptionRecord.trial_started_at = new Date().toISOString();
    subscriptionRecord.trial_ends_at = new Date(subscription.trial_end * 1000).toISOString();
    subscriptionRecord.trial_tier = trialTier;
    subscriptionRecord.trial_exports_used = 0;
    subscriptionRecord.trial_exports_limit = 500;
  }

  // Create new subscription record
  const { error: insertError } = await supabase.from("user_subscriptions").insert(subscriptionRecord);

  if (insertError) {
    console.error("[webhook] Error creating subscription:", insertError);
    throw insertError;
  }

  console.log("[webhook] Subscription created for user:", userId, "status:", status, isTrialing ? "(trial)" : "");
}

async function handleSubscriptionChange(supabase: any, subscription: Stripe.Subscription) {
  console.log("[webhook] Subscription changed:", subscription.id, "stripe_status:", subscription.status);

  // Try to get user_id from subscription metadata first
  let userId = subscription.metadata?.user_id;

  // If not in metadata, look up from database using stripe_subscription_id
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
      // Last resort: try to get from customer metadata
      const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
        apiVersion: "2023-10-16",
        httpClient: Stripe.createFetchHttpClient(),
      });

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

  // Determine status — map Stripe statuses to our internal statuses
  let status = "active";
  if (subscription.status === "trialing") status = "trialing";
  else if (subscription.status === "canceled") status = "cancelled";
  else if (subscription.status === "past_due") status = "past_due";
  else if (subscription.status === "unpaid")
    status = "cancelled"; // Treat unpaid as cancelled — full lockout
  else if (subscription.status === "incomplete_expired") status = "cancelled";
  else if (subscription.cancel_at_period_end) status = "active"; // Still active until period ends

  // Build update payload
  const updatePayload: Record<string, any> = {
    status,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    cancel_at: subscription.cancel_at ? new Date(subscription.cancel_at * 1000).toISOString() : null,
  };

  // If transitioning from trialing → active (trial ended, card charged),
  // clear the trial tracking fields so the user gets full monthly limits
  if (subscription.status === "active") {
    // Get current record to check if it was trialing
    const { data: currentSub } = await supabase
      .from("user_subscriptions")
      .select("status, trial_started_at")
      .eq("stripe_subscription_id", subscription.id)
      .maybeSingle();

    if (currentSub?.status === "trialing" && currentSub?.trial_started_at) {
      console.log("[webhook] Trial → Active conversion for user:", userId);
      // Reset trial export counter — user now gets full monthly limits
      updatePayload.trial_exports_used = 0;
    }
  }

  // If this is a trialing subscription, ensure trial fields are set
  if (subscription.status === "trialing" && subscription.trial_end) {
    updatePayload.trial_ends_at = new Date(subscription.trial_end * 1000).toISOString();
  }

  // Update subscription record
  const { error } = await supabase
    .from("user_subscriptions")
    .update(updatePayload)
    .eq("stripe_subscription_id", subscription.id);

  if (error) {
    console.error("[webhook] Error updating subscription:", error);
    throw error;
  }

  console.log("[webhook] Subscription updated for user:", userId, "status:", status);
}

async function handleSubscriptionDeleted(supabase: any, subscription: Stripe.Subscription) {
  console.log("[webhook] Subscription deleted:", subscription.id);

  // Try to get user_id from subscription metadata first
  let userId = subscription.metadata?.user_id;

  // If not in metadata, look up from database using stripe_subscription_id
  if (!userId) {
    const { data: existingSub } = await supabase
      .from("user_subscriptions")
      .select("user_id")
      .eq("stripe_subscription_id", subscription.id)
      .maybeSingle();

    if (existingSub?.user_id) {
      userId = existingSub.user_id;
      console.log("[webhook] Resolved user_id from database:", userId);
    }
  }

  if (!userId) {
    console.error("[webhook] No user_id found for subscription:", subscription.id);
    // Still try to cancel by stripe_subscription_id even without user_id
  }

  // Mark subscription as cancelled
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

async function handlePaymentSucceeded(supabase: any, invoice: Stripe.Invoice) {
  console.log("[webhook] Payment succeeded:", invoice.id);

  const subscriptionId = invoice.subscription as string;
  if (!subscriptionId) return;

  // Update subscription to ensure it's active
  const { error } = await supabase
    .from("user_subscriptions")
    .update({ status: "active" })
    .eq("stripe_subscription_id", subscriptionId);

  if (error) {
    console.error("[webhook] Error updating subscription after payment:", error);
  }
}

async function handlePaymentFailed(supabase: any, invoice: Stripe.Invoice) {
  console.log("[webhook] Payment failed:", invoice.id);

  const subscriptionId = invoice.subscription as string;
  if (!subscriptionId) return;

  // Mark subscription as past_due
  const { error } = await supabase
    .from("user_subscriptions")
    .update({ status: "past_due" })
    .eq("stripe_subscription_id", subscriptionId);

  if (error) {
    console.error("[webhook] Error updating subscription after failed payment:", error);
  }
}
