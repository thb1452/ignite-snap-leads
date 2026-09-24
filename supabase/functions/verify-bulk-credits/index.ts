// Edge Function: Verify & fulfill bulk credit purchase from Stripe
// Client-side fallback for when the webhook fails to deliver.
// Called by Settings page after returning from a bulk-credits checkout.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { applyBilling, checkoutPayment } from "../_shared/billingSync.ts";

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
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }

    const body = await req.json();
    if (typeof body.session_id !== "string") return Response.json({ fulfilled: false, reason: "session_id_required" }, { headers });
    const session = await stripe.checkout.sessions.retrieve(body.session_id);
    if (session.metadata?.user_id !== authData.user.id || session.metadata?.checkout_type !== "bulk_credits") {
      return Response.json({ error: "Checkout session does not belong to this account" }, { status: 403, headers });
    }
    if (session.payment_status !== "paid") return Response.json({ fulfilled: false, reason: "payment_pending" }, { headers });
    const payment = checkoutPayment(session);
    await applyBilling(supabase, { event_id: `verify-checkout:${session.id}`, event_type: "authenticated.checkout.verify", payment });
    return Response.json({ fulfilled: true, credits: payment.credits, session_id: session.id }, { headers });
  } catch (error) {
    console.error("[verify-bulk-credits] failed", error instanceof Error ? error.message : String(error));
    return Response.json({ fulfilled: false, error: "Payment verification is pending. Contact support if it persists." }, { status: 503, headers });
  }
});
