// Supabase Edge Function: Create Stripe Checkout Session
// Route: POST /create-checkout-session { plan_id: string }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";
import Stripe from "https://esm.sh/stripe@14.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const appUrl = Deno.env.get("APP_URL") || "https://app.snapignite.com";

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
    const { tier_name, billing_cycle = "monthly" } = body;

    if (!tier_name) {
      return new Response(
        JSON.stringify({ error: "tier_name required" }),
        { status: 400, headers }
      );
    }

    if (!["monthly", "annual"].includes(billing_cycle)) {
      return new Response(
        JSON.stringify({ error: "billing_cycle must be 'monthly' or 'annual'" }),
        { status: 400, headers }
      );
    }

    // ---- Get Plan ----
    const { data: plan, error: planError } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("name", tier_name)
      .single();

    if (planError || !plan) {
      return new Response(
        JSON.stringify({ error: "Plan not found" }),
        { status: 404, headers }
      );
    }

    // Calculate price based on billing cycle
    const priceAmount = billing_cycle === "annual"
      ? Math.round(plan.price_monthly_cents * 12 * 0.8) // 20% discount for annual
      : plan.price_monthly_cents;

    // ---- Get or Create Stripe Customer ----
    const { data: existingSubscription } = await supabase
      .from("user_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId = existingSubscription?.stripe_customer_id;

    if (!customerId) {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: user.id,
        },
      });
      customerId = customer.id;
      console.log("[checkout] Created Stripe customer:", customerId);
    }

    // ---- Create Checkout Session ----
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: plan.display_name,
              description: plan.description,
            },
            recurring: {
              interval: billing_cycle === "annual" ? "year" : "month",
            },
            unit_amount: priceAmount,
          },
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${appUrl}/leads?checkout=success`,
      cancel_url: `${appUrl}/pricing?canceled=true`,
      metadata: {
        user_id: user.id,
        plan_id: plan.id,
        billing_cycle: billing_cycle,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan_id: plan.id,
          billing_cycle: billing_cycle,
        },
      },
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
