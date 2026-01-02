// Supabase Edge Function: Create Stripe Customer Portal Session
// Route: POST /create-portal-session

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

    // ---- Get Customer ID ----
    const { data: subscription } = await supabase
      .from("user_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!subscription?.stripe_customer_id) {
      return new Response(
        JSON.stringify({ error: "No active subscription found" }),
        { status: 404, headers }
      );
    }

    // ---- Create Portal Session ----
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${appUrl}/settings?tab=subscription`,
    });

    console.log("[portal] Created portal session for customer:", subscription.stripe_customer_id);

    return new Response(
      JSON.stringify({
        url: session.url,
      }),
      { headers }
    );
  } catch (e: any) {
    console.error("[portal] error", e?.message ?? e);

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
