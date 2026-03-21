// Edge Function: Verify & sync subscription from Stripe
// Fallback for when webhooks fail to deliver
// Called by CheckoutSuccess page to ensure subscription record exists

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

    console.log("[verify-subscription] Checking for user:", userId, userEmail);

    // 1. Check if user already has an active subscription in DB
    const { data: existingSub } = await supabase
      .from("user_subscriptions")
      .select("id, status, stripe_subscription_id")
      .eq("user_id", userId)
      .in("status", ["active", "trialing", "trial"])
      .maybeSingle();

    if (existingSub?.stripe_subscription_id) {
      console.log("[verify-subscription] User already has active subscription:", existingSub.id);
      return new Response(
        JSON.stringify({ synced: false, reason: "already_exists", subscription_id: existingSub.id }),
        { headers }
      );
    }

    // 2. Find the user's Stripe customer by email
    const customers = await stripe.customers.list({ email: userEmail, limit: 5 });

    if (!customers.data.length) {
      console.log("[verify-subscription] No Stripe customer found for:", userEmail);
      return new Response(
        JSON.stringify({ synced: false, reason: "no_stripe_customer" }),
        { headers }
      );
    }

    // 3. Check each customer for active subscriptions
    for (const customer of customers.data) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: "all",
        limit: 5,
      });

      for (const sub of subscriptions.data) {
        if (!["active", "trialing"].includes(sub.status)) continue;

        console.log("[verify-subscription] Found Stripe subscription:", sub.id, "status:", sub.status);

        // 4. Look up the plan from metadata or price
        const planId = sub.metadata?.plan_id;
        let dbPlanId = planId;
        let planName: string | null = null;

        if (planId) {
          // Check if planId is a UUID or a tier name
          const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (UUID_RE.test(planId)) {
            const { data: planData } = await supabase
              .from("subscription_plans")
              .select("id, name")
              .eq("id", planId)
              .maybeSingle();
            if (planData) {
              dbPlanId = planData.id;
              planName = planData.name;
            }
          } else {
            // planId is a tier name like "elite" — resolve it
            const TIER_ALIAS: Record<string, string> = { elite: "enterprise" };
            const lookupName = TIER_ALIAS[planId.toLowerCase()] || planId.toLowerCase();
            const { data: planData } = await supabase
              .from("subscription_plans")
              .select("id, name")
              .eq("name", lookupName)
              .maybeSingle();
            if (planData) {
              dbPlanId = planData.id;
              planName = planData.name;
              console.log("[verify-subscription] Resolved plan from name:", planId, "→", planData.id);
            }
          }
        }

        // If no plan_id in metadata, try to match by price
        if (!dbPlanId) {
          const priceId = sub.items.data[0]?.price?.id;
          // TODO: Replace these placeholder IDs with real Stripe price IDs
          const PRICE_TO_PLAN: Record<string, string> = {
            "price_STARTER_ID": "starter",
            "price_PRO_ID": "professional",
            "price_ELITE_ID": "enterprise",
          };
          const matchedPlanName = priceId ? PRICE_TO_PLAN[priceId] : null;
          if (matchedPlanName) {
            const { data: planData } = await supabase
              .from("subscription_plans")
              .select("id, name")
              .eq("name", matchedPlanName)
              .maybeSingle();
            if (planData) {
              dbPlanId = planData.id;
              planName = planData.name;
            }
          }
        }

        if (!dbPlanId) {
          console.error("[verify-subscription] Could not resolve plan for subscription:", sub.id);
          continue;
        }

        // 5. Cancel any old subscriptions in DB for this user
        await supabase
          .from("user_subscriptions")
          .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
          .eq("user_id", userId)
          .in("status", ["active", "trial", "trialing"]);

        // 6. Build and insert the subscription record
        const isTrialing = sub.status === "trialing";
        const record: Record<string, any> = {
          user_id: userId,
          plan_id: dbPlanId,
          status: isTrialing ? "trialing" : "active",
          stripe_customer_id: customer.id,
          stripe_subscription_id: sub.id,
          current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        };

        if (isTrialing && sub.trial_end) {
          record.trial_started_at = new Date().toISOString();
          record.trial_ends_at = new Date(sub.trial_end * 1000).toISOString();
          record.trial_tier = planName;
          record.trial_exports_used = 0;
          record.trial_exports_limit = 500;
        }

        const { error: insertErr } = await supabase
          .from("user_subscriptions")
          .insert(record);

        if (insertErr) {
          console.error("[verify-subscription] Failed to insert subscription:", insertErr);
          return new Response(
            JSON.stringify({ synced: false, reason: "insert_failed", error: insertErr.message }),
            { status: 500, headers }
          );
        }

        console.log("[verify-subscription] Synced subscription for user:", userId, "plan:", planName);
        return new Response(
          JSON.stringify({ synced: true, plan: planName, status: record.status }),
          { headers }
        );
      }
    }

    console.log("[verify-subscription] No active Stripe subscription found for:", userEmail);
    return new Response(
      JSON.stringify({ synced: false, reason: "no_active_subscription" }),
      { headers }
    );
  } catch (e: any) {
    console.error("[verify-subscription] Error:", e?.message ?? e);
    return new Response(
      JSON.stringify({ error: e?.message ?? "Internal error" }),
      { status: 500, headers }
    );
  }
});
