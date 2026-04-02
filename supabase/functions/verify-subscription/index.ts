// Edge Function: Verify & sync subscription from Stripe
// Fallback for when webhooks fail to deliver
// Called by CheckoutSuccess page to ensure subscription record exists

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { resolvePlanFromStripeSubscription } from "../_shared/stripeSubscriptionPlan.ts";

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

    const user = authData.user;
    const userId = user.id;
    const userEmail = user.email;

    console.log("[verify-subscription] Reconciling from Stripe for user:", userId, userEmail);

    if (!userEmail) {
      return new Response(JSON.stringify({ synced: false, reason: "no_email" }), { headers });
    }

    const customers = await stripe.customers.list({ email: userEmail, limit: 10 });
    if (!customers.data.length) {
      console.log("[verify-subscription] No Stripe customer found for:", userEmail);
      return new Response(JSON.stringify({ synced: false, reason: "no_stripe_customer" }), { headers });
    }

    let bestSub: Stripe.Subscription | null = null;
    let bestCreated = -1;

    for (const customer of customers.data) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: "all",
        limit: 40,
      });

      for (const sub of subscriptions.data) {
        if (!["active", "trialing", "past_due"].includes(sub.status)) continue;
        if (sub.created > bestCreated) {
          bestCreated = sub.created;
          bestSub = sub;
        }
      }
    }

    if (!bestSub) {
      console.log("[verify-subscription] No billable Stripe subscription for:", userEmail);
      return new Response(JSON.stringify({ synced: false, reason: "no_active_subscription" }), { headers });
    }

    console.log("[verify-subscription] Canonical Stripe subscription:", bestSub.id, "status:", bestSub.status);

    const resolved = await resolvePlanFromStripeSubscription(supabase, bestSub);
    if (!resolved) {
      console.error("[verify-subscription] Could not map Stripe prices to a plan:", bestSub.id);
      return new Response(JSON.stringify({ synced: false, reason: "unknown_stripe_price" }), { status: 500, headers });
    }

    const dbPlanId = resolved.planId;
    const planName = resolved.planName;
    console.log(
      "[verify-subscription] Stripe price → plan",
      JSON.stringify({
        price_id: resolved.priceId,
        plan_id: dbPlanId,
        plan_name: planName,
        source: resolved.source,
      }),
    );

    const customerId = typeof bestSub.customer === "string" ? bestSub.customer : bestSub.customer?.id ?? "";
    const isTrialing = bestSub.status === "trialing";
    const dbStatus = isTrialing ? "trialing" : bestSub.status === "past_due" ? "past_due" : "active";

    const periodStart = new Date(bestSub.current_period_start * 1000).toISOString();
    const periodEnd = new Date(bestSub.current_period_end * 1000).toISOString();

    const { data: matchRows } = await supabase
      .from("user_subscriptions")
      .select("id")
      .eq("user_id", userId)
      .eq("stripe_subscription_id", bestSub.id)
      .order("created_at", { ascending: false })
      .limit(1);

    const matchId = matchRows?.[0]?.id;

    const { data: otherRows } = await supabase
      .from("user_subscriptions")
      .select("id, stripe_subscription_id")
      .eq("user_id", userId)
      .neq("status", "cancelled");

    for (const row of otherRows ?? []) {
      if (row.stripe_subscription_id !== bestSub.id) {
        await supabase
          .from("user_subscriptions")
          .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
          .eq("id", row.id);
      }
    }

    const baseUpdate: Record<string, unknown> = {
      plan_id: dbPlanId,
      status: dbStatus,
      stripe_customer_id: customerId,
      stripe_subscription_id: bestSub.id,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancelled_at: null,
    };

    if (isTrialing && bestSub.trial_end) {
      baseUpdate.trial_started_at = new Date().toISOString();
      baseUpdate.trial_ends_at = new Date(bestSub.trial_end * 1000).toISOString();
      baseUpdate.trial_tier = planName;
      baseUpdate.trial_exports_used = 0;
      baseUpdate.trial_exports_limit = 500;
    }

    if (matchId) {
      const { error: upErr } = await supabase.from("user_subscriptions").update(baseUpdate).eq("id", matchId);
      if (upErr) {
        console.error("[verify-subscription] Update failed:", upErr);
        return new Response(
          JSON.stringify({ synced: false, reason: "update_failed", error: upErr.message }),
          { status: 500, headers },
        );
      }
    } else {
      const insertRow: Record<string, unknown> = {
        user_id: userId,
        ...baseUpdate,
      };

      const { error: insertErr } = await supabase.from("user_subscriptions").insert(insertRow);
      if (insertErr) {
        console.error("[verify-subscription] Insert failed:", insertErr);
        return new Response(
          JSON.stringify({ synced: false, reason: "insert_failed", error: insertErr.message }),
          { status: 500, headers },
        );
      }
    }

    console.log("[verify-subscription] Synced user:", userId, "plan:", planName, "sub:", bestSub.id);
    return new Response(
      JSON.stringify({ synced: true, plan: planName, status: dbStatus, stripe_subscription_id: bestSub.id }),
      { headers },
    );
  } catch (e: any) {
    console.error("[verify-subscription] Error:", e?.message ?? e);
    return new Response(
      JSON.stringify({ error: e?.message ?? "Internal error" }),
      { status: 500, headers }
    );
  }
});
