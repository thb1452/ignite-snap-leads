// Edge Function: Verify & sync subscription from Stripe
// Fallback for when webhooks fail to deliver
// Called by CheckoutSuccess page to ensure subscription record exists

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { applyBilling, stripeObjectId, subscriptionSnapshot } from "../_shared/billingSync.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const headers = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!supabaseUrl || !supabaseKey || !stripeKey) {
      throw new Error("SERVER_MISCONFIGURED");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const stripe = new Stripe(stripeKey, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers,
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers,
      });
    }

    const userId = authData.user.id;
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* Verification can inspect the mapped subscription. */ }
    const sessionId = typeof body.session_id === "string" ? body.session_id : null;
    let subscriptionId: string | null = null;
    let paymentConfirmed = false;
    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.metadata?.user_id !== userId || session.mode !== "subscription") {
        return Response.json({ error: "Checkout session does not belong to this account" }, { status: 403, headers });
      }
      if (session.status !== "complete") return Response.json({ synced: false, reason: "checkout_pending" }, { headers });
      subscriptionId = stripeObjectId(session.subscription);
      paymentConfirmed = session.payment_status === "paid";
    } else {
      const { data: rows, error } = await supabase.from("user_subscriptions")
        .select("stripe_subscription_id").eq("user_id", userId).neq("status", "cancelled");
      if (error) throw error;
      if (rows?.length !== 1 || !rows[0].stripe_subscription_id) {
        return Response.json({ synced: false, reason: "subscription_mapping_requires_review" }, { headers });
      }
      subscriptionId = rows[0].stripe_subscription_id;
    }
    if (!subscriptionId) return Response.json({ synced: false, reason: "subscription_missing" }, { headers });
    const snapshot = await subscriptionSnapshot(supabase, stripe, subscriptionId, userId);
    await applyBilling(supabase, {
      event_id: `verify-subscription:${subscriptionId}:${crypto.randomUUID()}`,
      event_type: "authenticated.subscription.verify", subscription: snapshot,
    });
    // Return a verified session result, never infer a new payment from an old active row.
    const entitled = snapshot.stripe_status === "trialing"
      ? Boolean(snapshot.trial_end && Date.parse(snapshot.trial_end) > Date.now())
      : snapshot.stripe_status === "active" && Boolean(snapshot.paid_through && Date.parse(snapshot.paid_through) > Date.now());
    return Response.json({ synced: true, confirmed: Boolean(sessionId && entitled), payment_confirmed: paymentConfirmed,
      status: snapshot.stripe_status, plan: snapshot.plan_name, session_id: sessionId }, { headers });
  } catch (error) {
    console.error("[verify-subscription] failed", error instanceof Error ? error.message : String(error));
    return Response.json({ synced: false, error: "Subscription verification is pending. Contact support if it persists." }, { status: 503, headers });
  }
});
