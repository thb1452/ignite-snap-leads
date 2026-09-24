import type Stripe from "https://esm.sh/stripe@14.21.0";
import { assertStripeObjectMode } from "./stripeMode.ts";
import { resolvePlanFromStripeSubscription } from "./stripeSubscriptionPlan.ts";

// Shared by signed webhooks and authenticated verification. All writes are one RPC.
// Deliberately retain the project's pinned Stripe SDK/API until a separate upgrade.
export const stripeObjectId = (value: string | { id: string } | null | undefined): string | null =>
  typeof value === "string" ? value : value?.id ?? null;
const iso = (seconds: number | null | undefined) => seconds ? new Date(seconds * 1000).toISOString() : null;

export function paidPeriodEnd(invoice: Stripe.Invoice | null, subscriptionId: string, priceId?: string): string | null {
  if (!invoice || invoice.status !== "paid" || !invoice.paid) return null;
  // Invoice.period_end is the aggregation window, not the purchased service period.
  const periods = invoice.lines.data.filter(line =>
    line.type === "subscription" && !line.proration && stripeObjectId(line.subscription) === subscriptionId
    && (!priceId || stripeObjectId(line.price) === priceId)
  ).map(line => line.period.end);
  return periods.length ? iso(Math.max(...periods)) : null;
}

export function paidPlanVerified(invoice: Stripe.Invoice | null, subscription: Stripe.Subscription, priceId: string): boolean {
  if (!invoice?.paid || invoice.status !== "paid") return false;
  return invoice.lines.data.some(line => {
    if (stripeObjectId(line.subscription) !== subscription.id || stripeObjectId(line.price) !== priceId) return false;
    if (!line.proration) return line.type === "subscription" && line.amount >= 0;
    // Stripe's pinned API represents immediate upgrade prorations as invoiceitem
    // lines. Require its positive debit for the current item and current term;
    // unrelated invoice items and the old-plan credit are not payment proof.
    return (line.type === "invoiceitem" || line.type === "subscription") && line.amount > 0
      && invoice.billing_reason === "subscription_update" && stripeObjectId(invoice.subscription) === subscription.id
      && subscription.items.data.some(item => item.id === stripeObjectId(line.subscription_item)
        && stripeObjectId(item.price) === priceId)
      && line.period.start >= subscription.current_period_start
      && line.period.start < line.period.end && line.period.end === subscription.current_period_end;
  });
}

export async function subscriptionSnapshot(supabase: any, stripe: Stripe, subscriptionId: string, expectedUser: string | undefined, expectedLivemode: boolean) {
  // The database issues a monotonic ticket before each provider fetch. This avoids
  // ordering events by their second-resolution timestamp or trusting Edge clock drift.
  const { data: syncVersion, error: versionError } = await supabase.rpc("fn_begin_billing_sync_v1");
  if (versionError || !syncVersion) throw versionError ?? new Error("billing_sync_version_unavailable");
  const observedAt = new Date().toISOString();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["latest_invoice"] });
  assertStripeObjectMode(subscription, expectedLivemode);
  const { data: existing, error } = await supabase.from("user_subscriptions")
    .select("user_id").eq("stripe_subscription_id", subscriptionId).maybeSingle();
  if (error) throw error;
  let userId = subscription.metadata?.user_id ?? existing?.user_id;
  if (subscription.metadata?.user_id && existing?.user_id && subscription.metadata.user_id !== existing.user_id)
    throw new Error("subscription_owner_conflict");
  if (!userId && subscription.customer) {
    const customer = await stripe.customers.retrieve(stripeObjectId(subscription.customer)!);
    if (!customer.deleted) { assertStripeObjectMode(customer, expectedLivemode); userId = customer.metadata?.supabase_user_id; }
  }
  if (!userId || (expectedUser && userId !== expectedUser)) throw new Error("subscription_owner_unverified");
  const plan = await resolvePlanFromStripeSubscription(supabase, subscription);
  if (!plan) throw new Error("unknown_stripe_price");
  let invoice = subscription.latest_invoice as Stripe.Invoice | null;
  if (typeof invoice === "string") invoice = await stripe.invoices.retrieve(invoice);
  if (invoice) assertStripeObjectMode(invoice, expectedLivemode);
  return {
    user_id: userId,
    subscription_id: subscription.id,
    customer_id: stripeObjectId(subscription.customer),
    plan_id: plan.planId,
    plan_name: plan.planName,
    stripe_status: subscription.status,
    observed_at: observedAt,
    sync_version: syncVersion,
    period_start: iso(subscription.current_period_start),
    period_end: iso(subscription.current_period_end),
    paid_through: paidPeriodEnd(invoice, subscription.id, plan.priceId),
    paid_plan_verified: paidPlanVerified(invoice, subscription, plan.priceId),
    trial_start: iso(subscription.trial_start),
    trial_end: iso(subscription.trial_end),
    cancel_at: iso(subscription.cancel_at),
    cancelled_at: iso(subscription.canceled_at),
  };
}

export async function applyBilling(supabase: any, payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc("fn_apply_billing_event_v1", { p_event: payload });
  if (error) throw error; // Never acknowledge an event whose transaction failed.
  return data;
}

export function checkoutPayment(session: Stripe.Checkout.Session, expectedLivemode: boolean) {
  assertStripeObjectMode(session, expectedLivemode);
  if (session.payment_status !== "paid") throw new Error("checkout_payment_pending");
  const userId = session.metadata?.user_id;
  const kind = session.metadata?.checkout_type;
  if (!userId || !["single_unlock", "bulk_credits"].includes(kind ?? "")) throw new Error("checkout_metadata_invalid");
  const credits = Number(session.metadata?.credit_count ?? 0);
  if (kind === "bulk_credits" && ![5000, 10000, 20000].includes(credits)) throw new Error("checkout_pack_invalid");
  const paymentIntent = stripeObjectId(session.payment_intent);
  if (!paymentIntent) throw new Error("payment_intent_missing");
  return {
    user_id: userId, kind, session_id: session.id, payment_intent_id: paymentIntent,
    amount: session.amount_total, currency: session.currency, credits,
    property_id: session.metadata?.property_id ?? null,
  };
}
