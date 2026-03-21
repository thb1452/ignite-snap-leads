// Supabase Edge Function: Create Stripe Checkout Session
// Route: POST /create-checkout-session
// Supports: subscriptions AND one-time payments (single unlock, credit packs)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";
import Stripe from "https://esm.sh/stripe@14.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Credit pack definitions: { price in cents, credits granted }
const CREDIT_PACKS: Record<string, { amount: number; credits: number; label: string }> = {
  pack_500:  { amount: 5000,  credits: 500,  label: "500 Credits" },
  pack_1200: { amount: 10000, credits: 1200, label: "1,200 Credits" },
  pack_3000: { amount: 22500, credits: 3000, label: "3,000 Credits" },
};

// Single unlock price in cents
const SINGLE_UNLOCK_PRICE = 500; // $5

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
    const { checkout_type } = body;

    // Route to the appropriate handler
    if (checkout_type === "single_unlock") {
      return await handleSingleUnlock(stripe, supabase, user, body, appUrl, headers);
    } else if (checkout_type === "credit_pack") {
      return await handleCreditPack(stripe, supabase, user, body, appUrl, headers);
    } else {
      // Default: subscription checkout (backward compatible)
      return await handleSubscription(stripe, supabase, user, body, appUrl, headers);
    }
  } catch (e: any) {
    console.error("[checkout] error", e?.message ?? e);
    return new Response(
      JSON.stringify({ error: e?.message ?? "Internal error" }),
      { status: 500, headers }
    );
  }
});

// ---- Single Unlock ($5) ----
async function handleSingleUnlock(
  stripe: Stripe,
  supabase: any,
  user: any,
  body: any,
  appUrl: string,
  headers: Record<string, string>
) {
  const { property_id } = body;
  if (!property_id) {
    return new Response(
      JSON.stringify({ error: "property_id required for single_unlock" }),
      { status: 400, headers }
    );
  }

  const customerId = await getOrCreateCustomer(stripe, supabase, user);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ["card"],
    line_items: [{
      price_data: {
        currency: "usd",
        product_data: { name: "Single Property Unlock" },
        unit_amount: SINGLE_UNLOCK_PRICE,
      },
      quantity: 1,
    }],
    mode: "payment",
    success_url: `${appUrl}/properties?unlocked=${property_id}`,
    cancel_url: `${appUrl}/properties?unlock_cancelled=true`,
    metadata: {
      user_id: user.id,
      checkout_type: "single_unlock",
      property_id,
    },
  });

  console.log("[checkout] Created single unlock session:", session.id, "for property:", property_id);

  return new Response(
    JSON.stringify({ sessionId: session.id, checkout_url: session.url, url: session.url }),
    { headers }
  );
}

// ---- Credit Pack ----
async function handleCreditPack(
  stripe: Stripe,
  supabase: any,
  user: any,
  body: any,
  appUrl: string,
  headers: Record<string, string>
) {
  const { pack_id } = body;
  const pack = CREDIT_PACKS[pack_id];

  if (!pack) {
    return new Response(
      JSON.stringify({ error: `Unknown pack: ${pack_id}. Valid: ${Object.keys(CREDIT_PACKS).join(", ")}` }),
      { status: 400, headers }
    );
  }

  const customerId = await getOrCreateCustomer(stripe, supabase, user);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ["card"],
    line_items: [{
      price_data: {
        currency: "usd",
        product_data: { name: `Snap Ignite ${pack.label}` },
        unit_amount: pack.amount,
      },
      quantity: 1,
    }],
    mode: "payment",
    success_url: `${appUrl}/properties?credits_added=${pack.credits}`,
    cancel_url: `${appUrl}/pricing?canceled=true`,
    metadata: {
      user_id: user.id,
      checkout_type: "credit_pack",
      credits: String(pack.credits),
      pack_id,
    },
  });

  console.log("[checkout] Created credit pack session:", session.id, "pack:", pack_id);

  return new Response(
    JSON.stringify({ sessionId: session.id, checkout_url: session.url, url: session.url }),
    { headers }
  );
}

// ---- Subscription (existing logic, refactored) ----
async function handleSubscription(
  stripe: Stripe,
  supabase: any,
  user: any,
  body: any,
  appUrl: string,
  headers: Record<string, string>
) {
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

  // ---- Stripe Price IDs ----
  // TODO: Replace these placeholder IDs with real Stripe price IDs
  const STRIPE_PRICE_IDS: Record<string, string> = {
    starter: "price_STARTER_ID",
    professional: "price_PRO_ID",
    enterprise: "price_ELITE_ID",
    elite: "price_ELITE_ID",
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
    }
  }

  // ---- For internal trials, cancel old record ----
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
    customerId = await getOrCreateCustomer(stripe, supabase, user);
  }

  // ---- Create Checkout Session ----
  const subscriptionData: Record<string, any> = {
    metadata: {
      user_id: user.id,
      plan_id: plan?.id ?? tier_name,
      billing_cycle,
      is_trial: trial ? "true" : "false",
    },
  };

  if (trial) {
    subscriptionData.trial_period_days = 3;
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
      billing_cycle,
      is_trial: trial ? "true" : "false",
    },
    subscription_data: subscriptionData,
    allow_promotion_codes: true,
  });

  console.log("[checkout] Created subscription checkout session:", session.id);

  return new Response(
    JSON.stringify({
      sessionId: session.id,
      checkout_url: session.url,
      url: session.url,
    }),
    { headers }
  );
}

// ---- Shared: Get or Create Stripe Customer ----
async function getOrCreateCustomer(
  stripe: Stripe,
  supabase: any,
  user: any
): Promise<string> {
  // Check if user already has a customer ID from an existing subscription
  const { data: existingSub } = await supabase
    .from("user_subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .not("stripe_customer_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (existingSub?.stripe_customer_id) {
    return existingSub.stripe_customer_id;
  }

  // Check Stripe directly
  const existingCustomers = await stripe.customers.list({ email: user.email, limit: 1 });
  if (existingCustomers.data.length > 0) {
    console.log("[checkout] Found existing Stripe customer:", existingCustomers.data[0].id);
    return existingCustomers.data[0].id;
  }

  // Create new
  const customer = await stripe.customers.create({
    email: user.email,
    metadata: { supabase_user_id: user.id },
  });
  console.log("[checkout] Created Stripe customer:", customer.id);
  return customer.id;
}
