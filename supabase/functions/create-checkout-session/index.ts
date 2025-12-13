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
    const { plan_id } = body;

    if (!plan_id) {
      return new Response(
        JSON.stringify({ error: "plan_id required" }),
        { status: 400, headers }
      );
    }

    // ---- Get Plan ----
    const { data: plan, error: planError } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("id", plan_id)
      .single();

    if (planError || !plan) {
      return new Response(
        JSON.stringify({ error: "Plan not found" }),
        { status: 404, headers }
      );
    }

    if (!plan.stripe_price_id) {
      return new Response(
        JSON.stringify({ error: "Plan not available for purchase (no Stripe price ID)" }),
        { status: 400, headers }
      );
    }

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
          price: plan.stripe_price_id,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${appUrl}/settings?tab=subscription&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/settings?tab=subscription&canceled=true`,
      metadata: {
        user_id: user.id,
        plan_id: plan_id,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan_id: plan_id,
        },
      },
      allow_promotion_codes: true,
    });

    console.log("[checkout] Created checkout session:", session.id);

    return new Response(
      JSON.stringify({
        sessionId: session.id,
        url: session.url,
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
