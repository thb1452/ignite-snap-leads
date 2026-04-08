// Edge Function: Verify & fulfill bulk credit purchase from Stripe
// Client-side fallback for when the webhook fails to deliver.
// Called by Settings page after returning from a bulk-credits checkout.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";
import Stripe from "https://esm.sh/stripe@14.21.0";

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

    const user = authData.user;
    const userId = user.id;

    // Body may optionally include a session_id for targeted verification
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty body is fine */ }
    const sessionId = typeof body.session_id === "string" ? body.session_id : null;

    console.log("[verify-bulk-credits] user:", userId, "session_id:", sessionId);

    // Strategy: look up recent checkout sessions for this user's Stripe customer
    // and fulfill any bulk_credits sessions that haven't been ledgered yet.
    const userEmail = user.email;
    if (!userEmail) {
      return new Response(JSON.stringify({ fulfilled: false, reason: "no_email" }), { headers });
    }

    const customers = await stripe.customers.list({ email: userEmail, limit: 5 });
    if (!customers.data.length) {
      return new Response(JSON.stringify({ fulfilled: false, reason: "no_stripe_customer" }), { headers });
    }

    let totalFulfilled = 0;

    for (const customer of customers.data) {
      // List recent completed checkout sessions
      const sessions = await stripe.checkout.sessions.list({
        customer: customer.id,
        status: "complete",
        limit: sessionId ? 1 : 10,
        ...(sessionId ? {} : {}),
      });

      for (const session of sessions.data) {
        // If a specific session was requested, only process that one
        if (sessionId && session.id !== sessionId) continue;

        // Only process bulk_credits sessions
        if (session.metadata?.checkout_type !== "bulk_credits") continue;
        if (session.metadata?.user_id !== userId) continue;

        const credits = parseInt(session.metadata?.credit_count ?? "0", 10);
        if (credits <= 0) continue;

        // Check if already fulfilled (idempotency)
        const { data: existing } = await supabase
          .from("credit_ledger")
          .select("id")
          .eq("user_id", userId)
          .eq("reason", "credit_pack_purchase")
          .filter("meta->>stripe_session_id", "eq", session.id)
          .maybeSingle();

        if (existing) {
          console.log("[verify-bulk-credits] Already fulfilled session:", session.id);
          totalFulfilled += credits; // count as fulfilled for response
          continue;
        }

        // Verify payment was actually completed
        if (session.payment_status !== "paid") {
          console.log("[verify-bulk-credits] Session not paid:", session.id, session.payment_status);
          continue;
        }

        // Insert credits
        const paymentIntentId = typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent as any)?.id ?? null;

        const { error: creditErr } = await supabase.from("credit_ledger").insert({
          user_id: userId,
          delta: credits,
          reason: "credit_pack_purchase",
          meta: {
            stripe_session_id: session.id,
            payment_intent_id: paymentIntentId,
            credit_count: credits,
            source: "verify-bulk-credits",
          },
        });

        if (creditErr) {
          // 23505 = unique constraint violation — already inserted by webhook race
          if (creditErr.code === "23505") {
            console.log("[verify-bulk-credits] Credits already added (unique constraint), session:", session.id);
            totalFulfilled += credits;
          } else {
            console.error("[verify-bulk-credits] Insert error:", creditErr.message);
          }
          continue;
        }

        console.log("[verify-bulk-credits] Fulfilled", credits, "credits for session:", session.id);
        totalFulfilled += credits;
      }
    }

    return new Response(
      JSON.stringify({ fulfilled: totalFulfilled > 0, credits: totalFulfilled }),
      { headers },
    );
  } catch (e: any) {
    console.error("[verify-bulk-credits] Error:", e?.message ?? e);
    return new Response(
      JSON.stringify({ error: e?.message ?? "Internal error" }),
      { status: 500, headers },
    );
  }
});
