import type Stripe from "https://esm.sh/stripe@14.21.0";

/**
 * Canonical monthly subscription Stripe Price IDs.
 * Keep aligned with Stripe Dashboard and subscription_plans.stripe_price_id (migrations).
 */
export const STRIPE_SUBSCRIPTION_PRICE_IDS_BY_PLAN: Record<string, string> = {
  starter: "price_1TGlbmPfDZrVNjz5doWbUyvN",
  professional: "price_1TGlb4PfDZrVNjz5WqCEG1D9",
  enterprise: "price_1TGlcePfDZrVNjz5VLCsLkBQ",
};

/** price_xxx → DB plan name (starter | professional | enterprise) */
export const STRIPE_PRICE_TO_PLAN_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(STRIPE_SUBSCRIPTION_PRICE_IDS_BY_PLAN).map(([name, priceId]) => [priceId, name]),
);

export type PlanResolveSource = "subscription_plans.stripe_price_id" | "price_id_map" | null;

export type ResolvedPlanFromStripe = {
  planId: string;
  priceId: string;
  source: PlanResolveSource;
  planName: string | null;
};

type SupabaseLike = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{ data: { id: string; name?: string } | null }>;
      };
    };
  };
};

/**
 * Resolve DB plan from a Stripe subscription (recurring line items first).
 * 1) subscription_plans.stripe_price_id = price.id
 * 2) STRIPE_PRICE_TO_PLAN_NAME → subscription_plans.name
 */
export async function resolvePlanFromStripeSubscription(
  supabase: SupabaseLike,
  subscription: Stripe.Subscription,
): Promise<ResolvedPlanFromStripe | null> {
  const items = subscription.items?.data ?? [];
  const recurring = items.filter((i: any) => i.price && typeof i.price === "object" && i.price.recurring);
  const ordered = recurring.length > 0 ? recurring : items;

  const seenPriceIds: string[] = [];
  for (const item of ordered) {
    const price = item.price;
    const priceId = typeof price === "string" ? price : price?.id;
    if (!priceId) continue;
    seenPriceIds.push(priceId);

    const { data: byCol } = await supabase
      .from("subscription_plans")
      .select("id, name")
      .eq("stripe_price_id", priceId)
      .maybeSingle();
    if (byCol?.id) {
      console.log(
        "[stripe-plan]",
        JSON.stringify({
          event: "resolved",
          stripe_subscription_id: subscription.id,
          price_id: priceId,
          plan_id: byCol.id,
          plan_name: byCol.name ?? null,
          source: "subscription_plans.stripe_price_id",
        }),
      );
      return {
        planId: byCol.id,
        priceId,
        source: "subscription_plans.stripe_price_id",
        planName: byCol.name ?? null,
      };
    }

    const planName = STRIPE_PRICE_TO_PLAN_NAME[priceId];
    if (planName) {
      const { data: byName } = await supabase
        .from("subscription_plans")
        .select("id, name")
        .eq("name", planName)
        .maybeSingle();
      if (byName?.id) {
        console.log(
          "[stripe-plan]",
          JSON.stringify({
            event: "resolved",
            stripe_subscription_id: subscription.id,
            price_id: priceId,
            plan_id: byName.id,
            plan_name: byName.name ?? null,
            source: "price_id_map",
          }),
        );
        return {
          planId: byName.id,
          priceId,
          source: "price_id_map",
          planName: byName.name ?? null,
        };
      }
      console.warn(
        "[stripe-plan]",
        JSON.stringify({
          event: "map_hit_db_miss",
          stripe_subscription_id: subscription.id,
          price_id: priceId,
          expected_plan_name: planName,
        }),
      );
    }
  }

  console.error(
    "[stripe-plan]",
    JSON.stringify({
      event: "unresolved",
      stripe_subscription_id: subscription.id,
      price_ids_tried: seenPriceIds,
      item_count: items.length,
    }),
  );
  return null;
}

/** Backward-compatible: returns only plan UUID */
export async function resolvePlanIdFromStripeSubscription(
  supabase: SupabaseLike,
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const r = await resolvePlanFromStripeSubscription(supabase, subscription);
  return r?.planId ?? null;
}
