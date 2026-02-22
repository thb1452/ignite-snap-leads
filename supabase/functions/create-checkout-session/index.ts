// Supabase Edge Function: Create Stripe Checkout Session
// Route: POST /create-checkout-session { plan_id: string }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";
import Stripe from "https://esm.sh/stripe@14.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const headers = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    // ---- Env ----
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const appUrl = Deno.env.get("APP_URL") || "http://localhost:5173";

    if (!supabaseUrl || !supabaseKey || !stripeKey) {
      throw new Error("SERVER_MISCONFIGURED");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const stripe = new Stripe(stripeKey, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // ---- Auth ----
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authData?.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers }
      );
    }

    const user = authData.user;

    // ---- Input ----
    const body = await req.json();
    const { tier_name, billing_cycle = "monthly", trial = false } = body;

    if (!tier_name) {
      return new Response(
        JSON.stringify({ error: "tier_name required" }),
        { status: 400, headers }
      );
    }

    // Normalize tier name: "elite" maps to "enterprise" in DB
    const TIER_ALIAS: Record<string, string> = { elite: "enterprise" };
    const dbTierName = TIER_ALIAS[tier_name.toLowerCase()] || tier_name.toLowerCase();

    if (!["monthly", "annual"].includes(billing_cycle)) {
      return new Response(
        JSON.stringify({ error: "billing_cycle must be 'monthly' or 'annual'" }),
        { status: 400, headers }
      );
    }

    // ---- Stripe Price IDs (LIVE MODE - monthly) ----
    const STRIPE_PRICE_IDS: Record<string, string> = {
      starter: "price_1T2kFABg6vwuzzF0LvKvfUsz",
      professional: "price_1T2kEeBg6vwuzzF0fOjHbxBX",
      enterprise: "price_1T3kgtBg6vwuzzF0VdhC1HFk",
      elite: "price_1T3kgtBg6vwuzzF0VdhC1HFk",
    };

    const priceId = STRIPE_PRICE_IDS[tier_name.toLowerCase()];
    if (!priceId) {
      return new Response(
        JSON.stringify({ error: `Unknown plan: ${tier_name}` }),
        { status: 400, headers }
      );
    }

    // ---- Get Plan from DB for metadata ----
    const { data: plan } = await supabase
      .from("subscription_plans")
      .select("id, display_name, name")
      .eq("name", dbTierName)
      .single();

    // ---- Get or Create Stripe Customer ----
    const { data: existingSubscription } = await supabase
      .from("user_subscriptions")
      .select("id, stripe_customer_id, stripe_subscription_id, status, plan_id")
      .eq("user_id", user.id)
      .in("status", ["active", "trialing", "trial"])
      .maybeSingle();

    let customerId = existingSubscription?.stripe_customer_id;

    // ---- If user already has a Stripe trialing subscription for the SAME plan, end trial now ----
    if (
      existingSubscription?.stripe_subscription_id &&
      (existingSubscription.status === "trialing" || existingSubscription.status === "trial") &&
      plan?.id &&
      existingSubscription.plan_id === plan.id
    ) {
      console.log("[checkout] User already trialing same plan, ending trial now:", existingSubscription.stripe_subscription_id);
      try {
        const updated = await stripe.subscriptions.update(existingSubscription.stripe_subscription_id, {
          trial_end: "now",
        });
        console.log("[checkout] Trial ended, subscription status:", updated.status);

        // Update DB record immediately
        await supabase
          .from("user_subscriptions")
          .update({
            status: "active",
            trial_exports_used: 0,
            current_period_start: new Date(updated.current_period_start * 1000).toISOString(),
            current_period_end: new Date(updated.current_period_end * 1000).toISOString(),
          })
          .eq("stripe_subscription_id", existingSubscription.stripe_subscription_id);

        return new Response(
          JSON.stringify({
            upgraded: true,
            message: "Trial converted to active subscription",
            redirect_url: `${appUrl}/checkout/success`,
          }),
          { headers }
        );
      } catch (stripeErr: any) {
        console.error("[checkout] Failed to end trial:", stripeErr.message);
        // Fall through to create new checkout session
      }
    }

    // ---- For internal trials (no stripe_subscription_id), cancel the old record so
    //      the webhook can cleanly insert the new subscription after checkout ----
    if (
      existingSubscription &&
      !existingSubscription.stripe_subscription_id &&
      (existingSubscription.status === "trial" || existingSubscription.status === "trialing")
    ) {
      console.log("[checkout] Cancelling internal trial record:", existingSubscription.id);
      await supabase
        .from("user_subscriptions")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", existingSubscription.id);
    }

    if (!customerId) {
      // Check if a Stripe customer already exists by email before creating a new one
      const existingCustomers = await stripe.customers.list({ email: user.email, limit: 1 });
      if (existingCustomers.data.length > 0) {
        customerId = existingCustomers.data[0].id;
        console.log("[checkout] Found existing Stripe customer:", customerId);
      } else {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { supabase_user_id: user.id },
        });
        customerId = customer.id;
        console.log("[checkout] Created Stripe customer:", customerId);
      }
    }

    // ---- Create Checkout Session with real Stripe Price ----
    const subscriptionData: Record<string, any> = {
      metadata: {
        user_id: user.id,
        plan_id: plan?.id ?? tier_name,
        billing_cycle: billing_cycle,
        is_trial: trial ? "true" : "false",
      },
    };

    // Add 7-day trial period when requested
    if (trial) {
      subscriptionData.trial_period_days = 7;
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: trial
        ? `${appUrl}/checkout/success?trial=true`
        : `${appUrl}/checkout/success`,
      cancel_url: `${appUrl}/pricing?canceled=true`,
      metadata: {
        user_id: user.id,
        plan_id: plan?.id ?? tier_name,
        billing_cycle: billing_cycle,
        is_trial: trial ? "true" : "false",
      },
      subscription_data: subscriptionData,
      allow_promotion_codes: true,
    });

    console.log("[checkout] Created checkout session:", session.id);

    return new Response(
      JSON.stringify({
        sessionId: session.id,
        checkout_url: session.url,
        url: session.url, // Keep for backward compatibility
      }),
      { headers }
    );
  } catch (e: any) {
    console.error("[checkout] error", e?.message ?? e);

    let status = 500;
    let msg = "Internal error";

    switch (e?.message) {
      case "SERVER_MISCONFIGURED":
        status = 500;
        msg = "Server misconfigured";
        break;
      default:
        if (typeof e?.message === "string") msg = e.message;
    }

    return new Response(JSON.stringify({ error: msg }), { status, headers });
  }
});
