import type Stripe from "https://esm.sh/stripe@14.21.0";

import { assertStripeObjectMode } from "./stripeMode.ts";

type Mapping = { stripe_subscription_id: string | null; stripe_customer_id: string | null; status: string };
/** No local deletes. A failed Stripe read/cancel/confirmation rejects the entire closure. */
export async function cancelOwnedSubscriptions(stripe: Stripe, userId: string, email: string | undefined, rows: Mapping[], expectedLivemode: boolean) {
  if (rows.some(row => !row.stripe_subscription_id && ["active", "past_due", "unpaid"].includes(row.status)))
    throw new Error("billing_mapping_requires_review");
  const mappedIds = new Set(rows.flatMap(row => row.stripe_subscription_id ? [row.stripe_subscription_id] : []));
  const customerIds = new Set(rows.flatMap(row => row.stripe_customer_id ? [row.stripe_customer_id] : []));
  if (email) {
    for await (const customer of stripe.customers.list({ email, limit: 100 })) {
      assertStripeObjectMode(customer, expectedLivemode);
      if (customer.metadata?.supabase_user_id === userId) customerIds.add(customer.id);
    }
  }
  // Include subscriptions even when their local customer mapping is missing.
  for (const id of mappedIds) {
    const subscription = await stripe.subscriptions.retrieve(id);
    assertStripeObjectMode(subscription, expectedLivemode);
    if (subscription.metadata?.user_id && subscription.metadata.user_id !== userId) throw new Error("billing_owner_conflict");
    const customer = subscription.customer;
    customerIds.add(typeof customer === "string" ? customer : customer.id);
  }
  const owned = new Set<string>(mappedIds);
  for (const customerId of customerIds) {
    for await (const subscription of stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 })) {
      assertStripeObjectMode(subscription, expectedLivemode);
      if (!mappedIds.has(subscription.id) && subscription.metadata?.user_id !== userId) {
        if (!["canceled", "incomplete_expired"].includes(subscription.status)) throw new Error("billing_subscription_scope_unverified");
        continue;
      }
      if (subscription.metadata?.user_id && subscription.metadata.user_id !== userId) throw new Error("billing_owner_conflict");
      owned.add(subscription.id);
    }
  }
  for (const id of owned) {
    let subscription = await stripe.subscriptions.retrieve(id);
    assertStripeObjectMode(subscription, expectedLivemode);
    if (!["canceled", "incomplete_expired"].includes(subscription.status)) {
      await stripe.subscriptions.cancel(id, { prorate: false, invoice_now: false });
      subscription = await stripe.subscriptions.retrieve(id);
      assertStripeObjectMode(subscription, expectedLivemode);
    }
    if (!["canceled", "incomplete_expired"].includes(subscription.status)) throw new Error("billing_cancellation_unconfirmed");
  }
}
