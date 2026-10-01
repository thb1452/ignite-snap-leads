import type Stripe from "https://esm.sh/stripe@14.21.0";
import { assertStripeObjectMode } from "./stripeMode.ts";

const PACK_AMOUNTS: Record<string, number> = { "5000": 75000, "10000": 130000, "20000": 220000 };
const PLAN_ALIASES: Record<string, string> = {
  starter: "starter", pro: "professional", professional: "professional", elite: "enterprise", enterprise: "enterprise",
};
const priceIdentity = (value: unknown): value is string => typeof value === "string" && /^price_[A-Za-z0-9]+$/.test(value);

/** Validate a configured price before any customer, checkout or subscription write. */
export async function validatedCheckoutPrice(
  stripe: Stripe, priceId: string, amount: number, recurring: boolean, expectedLivemode: boolean,
): Promise<Stripe.Price> {
  if (!priceIdentity(priceId) || !Number.isSafeInteger(amount) || amount <= 0) throw new Error("checkout_catalog_unavailable");
  const price = await stripe.prices.retrieve(priceId);
  assertStripeObjectMode(price, expectedLivemode);
  if (price.id !== priceId || price.active !== true || price.currency !== "usd" || price.unit_amount !== amount
    || price.billing_scheme !== "per_unit" || price.transform_quantity != null || price.custom_unit_amount != null) {
    throw new Error("checkout_catalog_price_mismatch");
  }
  if (recurring) {
    if (price.type !== "recurring" || price.recurring?.interval !== "month" || price.recurring.interval_count !== 1
      || price.recurring.usage_type !== "licensed") throw new Error("checkout_catalog_recurrence_mismatch");
  } else if (price.type !== "one_time" || price.recurring != null) throw new Error("checkout_catalog_recurrence_mismatch");
  return price;
}

/** New purchases use this environment's reviewed DB mapping, never legacy aliases. */
export async function subscriptionCheckoutCatalog(supabase: any, stripe: Stripe, tier: unknown, expectedLivemode: boolean) {
  const name = typeof tier === "string" ? PLAN_ALIASES[tier.toLowerCase()] : undefined;
  if (!name) throw new Error("checkout_plan_unavailable");
  const { data: plan, error } = await supabase.from("subscription_plans")
    .select("id, name, display_name, is_active, stripe_price_id, price_monthly_cents").eq("name", name).maybeSingle();
  if (error) throw error;
  if (!plan?.id || plan.name !== name || plan.is_active !== true || !priceIdentity(plan.stripe_price_id)) {
    throw new Error("checkout_catalog_unavailable");
  }
  // The webhook resolves by this exact column. Reject ambiguous/reassigned prices
  // before charging, even when a historical fallback could otherwise name a plan.
  const { data: reverse, error: reverseError } = await supabase.from("subscription_plans")
    .select("id, name").eq("stripe_price_id", plan.stripe_price_id).maybeSingle();
  if (reverseError) throw reverseError;
  if (reverse?.id !== plan.id || reverse?.name !== name) throw new Error("checkout_fulfillment_mapping_mismatch");
  await validatedCheckoutPrice(stripe, plan.stripe_price_id, plan.price_monthly_cents, true, expectedLivemode);
  return { plan, priceId: plan.stripe_price_id as string };
}

/** Server-only JSON: {"5000":"price_...",...}. No historical/default prices. */
export async function bulkCheckoutCatalog(stripe: Stripe, credits: unknown, rawCatalog: string | undefined, expectedLivemode: boolean) {
  if (typeof credits !== "string" && typeof credits !== "number") throw new Error("checkout_pack_unavailable");
  const pack = String(credits);
  if (!Object.hasOwn(PACK_AMOUNTS, pack)) throw new Error("checkout_pack_unavailable");
  let catalog: Record<string, unknown>;
  try { catalog = JSON.parse(rawCatalog ?? ""); } catch { throw new Error("checkout_catalog_unavailable"); }
  if (!catalog || Array.isArray(catalog) || typeof catalog !== "object") throw new Error("checkout_catalog_unavailable");
  const entries = Object.entries(catalog);
  if (!entries.length || entries.some(([size, price]) => !Object.hasOwn(PACK_AMOUNTS, size) || !priceIdentity(price))
    || new Set(entries.map(([, price]) => price)).size !== entries.length || !priceIdentity(catalog[pack])) {
    throw new Error("checkout_catalog_unavailable");
  }
  const priceId = catalog[pack] as string;
  await validatedCheckoutPrice(stripe, priceId, PACK_AMOUNTS[pack], false, expectedLivemode);
  return { priceId, credits: Number(pack) };
}

/** Existing changes must not charge stale prices, extra items or hidden quantity. */
export async function existingCheckoutSubscription(
  stripe: Stripe, subscriptionId: string, userId: string, customerId: string | null | undefined,
  expectedLivemode: boolean, trialPriceId?: string,
): Promise<Stripe.Subscription> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  assertStripeObjectMode(subscription, expectedLivemode);
  const actualCustomerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (customerId && actualCustomerId !== customerId) throw new Error("checkout_existing_owner_mismatch");
  if (subscription.metadata?.user_id && subscription.metadata.user_id !== userId) throw new Error("checkout_existing_owner_mismatch");
  if (subscription.metadata?.user_id !== userId) {
    if (!actualCustomerId) throw new Error("checkout_existing_owner_unverified");
    const customer = await stripe.customers.retrieve(actualCustomerId);
    if (customer.deleted) throw new Error("checkout_existing_owner_unverified");
    assertStripeObjectMode(customer, expectedLivemode);
    if (customer.metadata?.supabase_user_id !== userId) throw new Error("checkout_existing_owner_unverified");
  }
  const items = subscription.items?.data ?? [];
  if (!["active", "trialing"].includes(subscription.status) || items.length !== 1 || items[0].quantity !== 1) {
    throw new Error("checkout_existing_subscription_requires_review");
  }
  if (trialPriceId && (subscription.status !== "trialing" || items[0].price?.id !== trialPriceId)) {
    throw new Error("checkout_existing_trial_price_mismatch");
  }
  return subscription;
}
