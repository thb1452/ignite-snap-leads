import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";
import Stripe from "https://esm.sh/stripe@14.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// PAYG: $0.67 per credit (single address unlock)
const PAYG_PRICE_ID = "price_1TGleEPfDZrVNjz5uPoCIrhU";

// Bulk credit packs (one-time payments)
const BULK_PRICE_IDS: Record<string, { priceId: string; credits: number }> = {
  "5000":  { priceId: "price_1TGlsfPfDZrVNjz5rpCB2h8c", credits: 5000 },
  "10000": { priceId: "price_1TGlu5PfDZrVNjz5GyjhPbEp", credits: 10000 },
  "20000": { priceId: "price_1TGlv7PfDZrVNjz5akOCyZbl", credits: 20000 },
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
    const appUrl = Deno.env.get("APP_URL") || "http://localhost:5173";

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
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }

    const user = authData.user;
    const body = await req.json();
    const { checkout_type } = body;

    if (checkout_type === "single_unlock") {
      return await handleSingleUnlock(stripe, supabase, user, body, appUrl, headers);
    } else if (checkout_type === "bulk_credits") {
      return await handleBulkCredits(stripe, supabase, user, body, appUrl, headers);
    } else {
      return await handleSubscription(stripe, supabase, user, body, appUrl, headers);
    }
  } catch (e: any) {
    console.error("[checkout] error", e?.message ?? e);
    return new Response(JSON.stringify({ error: e?.message ?? "Internal error" }), { status: 500, headers });
  }
});

// ---- Single Unlock (PAYG $0.97) ----
async function handleSingleUnlock(
  stripe: Stripe,
  supabase: any,
  user: any,
  body: any,
  appUrl: string,
  headers: Record<string, string>,
) {
  const { property_id } = body;
  if (!property_id) {
    return new Response(JSON.stringify({ error: "property_id required for single_unlock" }), { status: 400, headers });
  }

  const customerId = await getOrCreateCustomer(stripe, supabase, user);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ["card"],
    line_items: [{ price: PAYG_PRICE_ID, quantity: 1 }],
    mode: "payment",
    // Stripe replaces {CHECKOUT_SESSION_ID}. Client calls handle-unlock with stripe_session_id so unlock works if webhook is delayed.
    success_url: `${appUrl}/properties?checkout=success&propertyId=${property_id}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/properties?unlock_cancelled=true`,
    metadata: {
      user_id: user.id,
      checkout_type: "single_unlock",
      property_id,
    },
  });

  console.log("[checkout] Created single unlock session:", session.id, "for property:", property_id);

  return new Response(JSON.stringify({ sessionId: session.id, checkout_url: session.url, url: session.url }), {
    headers,
  });
}

// ---- Subscription ----
async function handleSubscription(
  stripe: Stripe,
  supabase: any,
  user: any,
  body: any,
  appUrl: string,
  headers: Record<string, string>,
) {
  const { tier_name, billing_cycle = "monthly", trial = false } = body;

  if (!tier_name) {
    return new Response(JSON.stringify({ error: "tier_name required" }), { status: 400, headers });
  }

  const TIER_ALIAS: Record<string, string> = { elite: "enterprise" };
  const dbTierName = TIER_ALIAS[tier_name.toLowerCase()] || tier_name.toLowerCase();

  // Stripe Price IDs (monthly subscriptions)
  const STRIPE_PRICE_IDS: Record<string, string> = {
    starter: "price_1TGlbmPfDZrVNjz5doWbUyvN",
    professional: "price_1TGlb4PfDZrVNjz5WqCEG1D9",
    enterprise: "price_1TGlcePfDZrVNjz5VLCsLkBQ",
    elite: "price_1TGlcePfDZrVNjz5VLCsLkBQ",
  };

  const priceId = STRIPE_PRICE_IDS[tier_name.toLowerCase()];
  if (!priceId) {
    return new Response(JSON.stringify({ error: `Unknown plan: ${tier_name}` }), { status: 400, headers });
  }

  const { data: plan } = await supabase
    .from("subscription_plans")
    .select("id, display_name, name")
    .eq("name", dbTierName)
    .single();

  const { data: existingSubscription } = await supabase
    .from("user_subscriptions")
    .select("id, stripe_customer_id, stripe_subscription_id, status, plan_id")
    .eq("user_id", user.id)
    .in("status", ["active", "trialing", "trial"])
    .maybeSingle();

  let customerId = existingSubscription?.stripe_customer_id;

  // If user already trialing same plan, convert to active
  if (
    existingSubscription?.stripe_subscription_id &&
    (existingSubscription.status === "trialing" || existingSubscription.status === "trial") &&
    plan?.id &&
    existingSubscription.plan_id === plan.id
  ) {
    try {
      const updated = await stripe.subscriptions.update(existingSubscription.stripe_subscription_id, {
        trial_end: "now",
      });
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
        { headers },
      );
    } catch (stripeErr: any) {
      console.error("[checkout] Failed to end trial:", stripeErr.message);
    }
  }

  // Cancel internal trial record
  if (
    existingSubscription &&
    !existingSubscription.stripe_subscription_id &&
    (existingSubscription.status === "trial" || existingSubscription.status === "trialing")
  ) {
    await supabase
      .from("user_subscriptions")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", existingSubscription.id);
  }

  if (!customerId) {
    customerId = await getOrCreateCustomer(stripe, supabase, user);
  }

  const subscriptionData: Record<string, any> = {
    metadata: { user_id: user.id, plan_id: plan?.id ?? tier_name, billing_cycle, is_trial: trial ? "true" : "false" },
  };

  if (trial) {
    subscriptionData.trial_period_days = 3;
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: "subscription",
    success_url: trial ? `${appUrl}/checkout/success?trial=true` : `${appUrl}/checkout/success`,
    cancel_url: `${appUrl}/pricing?canceled=true`,
    metadata: { user_id: user.id, plan_id: plan?.id ?? tier_name, billing_cycle, is_trial: trial ? "true" : "false" },
    subscription_data: subscriptionData,
    allow_promotion_codes: true,
  });

  return new Response(JSON.stringify({ sessionId: session.id, checkout_url: session.url, url: session.url }), {
    headers,
  });
}

// ---- Shared: Get or Create Stripe Customer ----
async function getOrCreateCustomer(stripe: Stripe, supabase: any, user: any): Promise<string> {
  const { data: existingSub } = await supabase
    .from("user_subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .not("stripe_customer_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (existingSub?.stripe_customer_id) return existingSub.stripe_customer_id;

  const existingCustomers = await stripe.customers.list({ email: user.email, limit: 1 });
  if (existingCustomers.data.length > 0) return existingCustomers.data[0].id;

  const customer = await stripe.customers.create({
    email: user.email,
    metadata: { supabase_user_id: user.id },
  });
  return customer.id;
}

// ---- Bulk Credits (one-time payment) ----
async function handleBulkCredits(
  stripe: Stripe,
  supabase: any,
  user: any,
  body: any,
  appUrl: string,
  headers: Record<string, string>,
) {
  const { credit_count } = body;
  const key = String(credit_count);
  const pack = BULK_PRICE_IDS[key];

  if (!pack) {
    return new Response(
      JSON.stringify({ error: `Invalid credit pack: ${credit_count}. Valid: 5000, 10000, 20000` }),
      { status: 400, headers },
    );
  }

  const customerId = await getOrCreateCustomer(stripe, supabase, user);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ["card"],
    line_items: [{ price: pack.priceId, quantity: 1 }],
    mode: "payment",
    success_url: `${appUrl}/properties?credits_added=${pack.credits}`,
    cancel_url: `${appUrl}/pricing?canceled=true`,
    metadata: {
      user_id: user.id,
      checkout_type: "bulk_credits",
      credit_count: String(pack.credits),
    },
  });

  console.log("[checkout] Created bulk credits session:", session.id, "credits:", pack.credits);

  return new Response(
    JSON.stringify({ sessionId: session.id, checkout_url: session.url, url: session.url }),
    { headers },
  );
}
