// Supabase Edge Function: Stripe Webhook Handler
// Route: POST /stripe-webhook (called by Stripe)

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
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret
      );
    } catch (err: any) {
      console.error("[webhook] Signature verification failed:", err.message);
      return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 400 });
    }

    console.log("[webhook] Received event:", event.type, event.id);

    // ---- Handle Event ----
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

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (e: any) {
    console.error("[webhook] error", e?.message ?? e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});

// ---- Event Handlers ----

async function handleCheckoutCompleted(
  supabase: any,
  session: Stripe.Checkout.Session
) {
  console.log("[webhook] Checkout completed:", session.id);

  const userId = session.metadata?.user_id;
  const planId = session.metadata?.plan_id;
  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;

  if (!userId || !planId) {
    console.error("[webhook] Missing metadata in checkout session");
    return;
  }

  // Get subscription details from Stripe
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    apiVersion: "2023-10-16",
    httpClient: Stripe.createFetchHttpClient(),
  });

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  // Cancel any existing active subscriptions for this user
  const { error: cancelError } = await supabase
    .from("user_subscriptions")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("status", "active");

  if (cancelError) {
    console.error("[webhook] Error cancelling old subscriptions:", cancelError);
  }

  // Create new subscription record
  const { error: insertError } = await supabase
    .from("user_subscriptions")
    .insert({
      user_id: userId,
      plan_id: planId,
      status: "active",
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    });

  if (insertError) {
    console.error("[webhook] Error creating subscription:", insertError);
    throw insertError;
  }

  console.log("[webhook] Subscription created for user:", userId);
}

async function handleSubscriptionChange(
  supabase: any,
  subscription: Stripe.Subscription
) {
  console.log("[webhook] Subscription changed:", subscription.id);

  const userId = subscription.metadata?.user_id;
  if (!userId) {
    console.error("[webhook] No user_id in subscription metadata");
    return;
  }

  // Determine status
  let status = "active";
  if (subscription.status === "canceled") status = "cancelled";
  else if (subscription.status === "past_due") status = "past_due";
  else if (subscription.status === "unpaid") status = "unpaid";
  else if (subscription.cancel_at_period_end) status = "active"; // Still active until period ends

  // Update subscription record
  const { error } = await supabase
    .from("user_subscriptions")
    .update({
      status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at: subscription.cancel_at
        ? new Date(subscription.cancel_at * 1000).toISOString()
        : null,
    })
    .eq("stripe_subscription_id", subscription.id);

  if (error) {
    console.error("[webhook] Error updating subscription:", error);
    throw error;
  }

  console.log("[webhook] Subscription updated for user:", userId, "status:", status);
}

async function handleSubscriptionDeleted(
  supabase: any,
  subscription: Stripe.Subscription
) {
  console.log("[webhook] Subscription deleted:", subscription.id);

  const userId = subscription.metadata?.user_id;
  if (!userId) {
    console.error("[webhook] No user_id in subscription metadata");
    return;
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

async function handlePaymentSucceeded(
  supabase: any,
  invoice: Stripe.Invoice
) {
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

async function handlePaymentFailed(
  supabase: any,
  invoice: Stripe.Invoice
) {
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
