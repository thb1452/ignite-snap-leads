import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { STRIPE_SUBSCRIPTION_PRICE_IDS_BY_PLAN } from "../_shared/stripeSubscriptionPlan.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// PAYG: $0.67 per credit (single address unlock)
const PAYG_PRICE_ID = "price_1TK02PBg6vwuzzF0scv7hfMA";

// Bulk credit packs (one-time payments)
const BULK_PRICE_IDS: Record<string, { priceId: string; credits: number }> = {
  "5000": { priceId: "price_1TK029Bg6vwuzzF035DVZXnR", credits: 5000 },
  "10000": { priceId: "price_1TK024Bg6vwuzzF0Z5Wj8nKO", credits: 10000 },
  "20000": { priceId: "price_1TK01vBg6vwuzzF0XPTpewXV", credits: 20000 },
};

async function resolveLatestInvoice(stripe: Stripe, subscription: Stripe.Subscription): Promise<Stripe.Invoice | null> {
  const li = subscription.latest_invoice;
  if (!li) return null;
  if (typeof li === "string") {
    return await stripe.invoices.retrieve(li);
  }
  return li as Stripe.Invoice;
}

function normalizeReturnPath(rawPath: unknown, fallback: string): string {
  if (typeof rawPath !== "string") return fallback;
  if (!rawPath.startsWith("/")) return fallback;
  return rawPath;
}

function appendQueryParam(path: string, key: string, value: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

/** After subscriptions.update with pending_if_incomplete: send user to pay the invoice, or success if already paid. Never implies DB changes — webhooks sync plan/credits. */
async function subscriptionChangePaymentResponse(
  updated: Stripe.Subscription,
  stripe: Stripe,
  appUrl: string,
  successPayload: { upgraded: boolean; message: string },
): Promise<Record<string, unknown>> {
  let inv = await resolveLatestInvoice(stripe, updated);
  if (inv?.status === "draft" && typeof inv.id === "string") {
    try {
      inv = await stripe.invoices.finalizeInvoice(inv.id);
    } catch {
      /* keep draft */
    }
  }

  const pending = updated.pending_update as { subscription_items?: unknown[] } | null | undefined;
  const hasPendingPlanChange = Array.isArray(pending?.subscription_items) && pending.subscription_items.length > 0;

  if (inv && inv.status !== "paid" && (inv.amount_due ?? 0) > 0 && inv.hosted_invoice_url) {
    return { url: inv.hosted_invoice_url, checkout_url: inv.hosted_invoice_url };
  }

  if (hasPendingPlanChange && (!inv || inv.status !== "paid")) {
    return {
      error:
        "Complete payment to apply this plan change. Use Settings → Manage subscription to pay open invoices or update your payment method.",
    };
  }

  return {
    ...successPayload,
    redirect_url: `${appUrl}/checkout/success`,
  };
}

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

// ---- Single Unlock (PAYG $0.67) ----
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
  const returnPath = normalizeReturnPath(body.return_path, "/settings?tab=subscription");

  if (!tier_name) {
    return new Response(JSON.stringify({ error: "tier_name required" }), { status: 400, headers });
  }

  const TIER_ALIAS: Record<string, string> = { elite: "enterprise" };
  const dbTierName = TIER_ALIAS[tier_name.toLowerCase()] || tier_name.toLowerCase();

  // Use the aliased name so "elite" resolves to the enterprise price
  const priceId = STRIPE_SUBSCRIPTION_PRICE_IDS_BY_PLAN[dbTierName];
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
    .in("status", ["active", "trialing", "trial", "past_due"])
    .maybeSingle();

  let customerId = existingSubscription?.stripe_customer_id;

  // If user already trialing same plan, convert to active (only after Stripe collects payment)
  if (
    existingSubscription?.stripe_subscription_id &&
    (existingSubscription.status === "trialing" || existingSubscription.status === "trial") &&
    plan?.id &&
    existingSubscription.plan_id === plan.id
  ) {
    try {
      const updated = await stripe.subscriptions.update(existingSubscription.stripe_subscription_id, {
        trial_end: "now",
        proration_behavior: "always_invoice",
        payment_behavior: "pending_if_incomplete",
      });
      const body = await subscriptionChangePaymentResponse(updated, stripe, appUrl, {
        upgraded: true,
        message: "Trial converted to active subscription",
      });
      if (typeof body.error === "string") {
        return new Response(JSON.stringify(body), { status: 400, headers });
      }
      return new Response(JSON.stringify(body), { headers });
    } catch (stripeErr: any) {
      console.error("[checkout] Failed to end trial:", stripeErr.message);
      return new Response(
        JSON.stringify({
          error: "Could not complete trial conversion. Update your payment method in billing settings or try again.",
        }),
        { status: 400, headers },
      );
    }
  }

  if (
    existingSubscription?.stripe_subscription_id &&
    plan?.id &&
    existingSubscription.plan_id !== plan.id &&
    ["active", "trialing", "trial", "past_due"].includes(String(existingSubscription.status))
  ) {
    let stripeSub: Stripe.Subscription;
    try {
      stripeSub = await stripe.subscriptions.retrieve(existingSubscription.stripe_subscription_id);
    } catch (retrieveErr: unknown) {
      const rmsg = retrieveErr instanceof Error ? retrieveErr.message : String(retrieveErr);
      console.error("[checkout] Failed to load Stripe subscription:", rmsg);
      return new Response(
        JSON.stringify({
          error: "Could not load your subscription. Try again or use Manage subscription in Settings.",
        }),
        { status: 400, headers },
      );
    }
    if (["canceled", "incomplete_expired"].includes(stripeSub.status)) {
      return new Response(
        JSON.stringify({
          error: "Unable to change plan for this subscription. Use billing settings or contact support.",
        }),
        { status: 400, headers },
      );
    }
    const itemId = stripeSub.items.data[0]?.id;
    if (!itemId) {
      return new Response(
        JSON.stringify({
          error: "Unable to change plan for this subscription. Use billing settings or contact support.",
        }),
        { status: 400, headers },
      );
    }

    const customerIdForPortal = typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer?.id;

    // pending_if_incomplete only allows a fixed set of params — NOT metadata (Stripe rejects the request if you mix them).
    // Webhooks resolve plan from stripe_price_id; user from stripe_subscription_id / customer metadata.
    try {
      const updated = await stripe.subscriptions.update(existingSubscription.stripe_subscription_id, {
        items: [{ id: itemId, price: priceId }],
        proration_behavior: "always_invoice",
        payment_behavior: "pending_if_incomplete",
      });
      const body = await subscriptionChangePaymentResponse(updated, stripe, appUrl, {
        upgraded: true,
        message: "Subscription plan updated",
      });
      if (typeof body.error === "string") {
        return new Response(JSON.stringify(body), { status: 400, headers });
      }
      return new Response(JSON.stringify(body), { headers });
    } catch (stripeErr: unknown) {
      const msg = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
      console.error("[checkout] Subscription plan change failed:", msg);

      if (customerIdForPortal) {
        try {
          const portalSession = await stripe.billingPortal.sessions.create({
            customer: customerIdForPortal,
            return_url: `${appUrl}/settings?tab=subscription`,
            flow_data: {
              type: "subscription_update_confirm",
              subscription_update_confirm: {
                subscription: existingSubscription.stripe_subscription_id,
                items: [{ id: itemId, price: priceId, quantity: 1 }],
              },
            },
          });
          if (portalSession.url) {
            console.log("[checkout] Using billing portal for plan change after API error");
            return new Response(JSON.stringify({ url: portalSession.url, checkout_url: portalSession.url }), {
              headers,
            });
          }
        } catch (portalErr: unknown) {
          const pmsg = portalErr instanceof Error ? portalErr.message : String(portalErr);
          console.error("[checkout] Billing portal plan change fallback failed:", pmsg);
        }
      }

      return new Response(
        JSON.stringify({
          error:
            "Unable to change your plan right now. Confirm your payment method in billing settings, then try again.",
        }),
        { status: 400, headers },
      );
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
    success_url: `${appUrl}${returnPath}`,
    cancel_url: `${appUrl}${returnPath}`,
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
  const returnPath = normalizeReturnPath(body.return_path, "/settings?tab=subscription");
  const key = String(credit_count);
  const pack = BULK_PRICE_IDS[key];

  if (!pack) {
    return new Response(JSON.stringify({ error: `Invalid credit pack: ${credit_count}. Valid: 5000, 10000, 20000` }), {
      status: 400,
      headers,
    });
  }

  const customerId = await getOrCreateCustomer(stripe, supabase, user);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ["card"],
    line_items: [{ price: pack.priceId, quantity: 1 }],
    mode: "payment",
    success_url: `${appUrl}${appendQueryParam(returnPath, "credits_added", String(pack.credits))}`,
    cancel_url: `${appUrl}${returnPath}`,
    metadata: {
      user_id: user.id,
      checkout_type: "bulk_credits",
      credit_count: String(pack.credits),
    },
  });

  console.log("[checkout] Created bulk credits session:", session.id, "credits:", pack.credits);

  return new Response(JSON.stringify({ sessionId: session.id, checkout_url: session.url, url: session.url }), {
    headers,
  });
}
