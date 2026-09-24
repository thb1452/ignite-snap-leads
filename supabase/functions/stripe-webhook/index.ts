import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { applyBilling, checkoutPayment, stripeObjectId, subscriptionSnapshot } from "../_shared/billingSync.ts";

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let eventId: string | null = null;
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!supabaseUrl || !supabaseKey || !stripeKey || !webhookSecret) throw new Error("SERVER_MISCONFIGURED");
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16", httpClient: Stripe.createFetchHttpClient() });
    const signature = req.headers.get("stripe-signature");
    if (!signature) return Response.json({ error: "No signature" }, { status: 400 });
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(await req.text(), signature, webhookSecret);
    } catch {
      return Response.json({ error: "Invalid signature" }, { status: 400 });
    }
    eventId = event.id;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const payload: Record<string, unknown> = { event_id: event.id, event_type: event.type };
    if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
      const object = event.data.object as Stripe.Checkout.Session;
      const session = await stripe.checkout.sessions.retrieve(object.id);
      if (session.mode === "subscription") {
        const subId = stripeObjectId(session.subscription);
        if (!subId) throw new Error("subscription_missing");
        payload.subscription = await subscriptionSnapshot(supabase, stripe, subId, session.metadata?.user_id);
      } else if (session.mode === "payment") {
        // Completed is not proof of settlement for delayed payment methods.
        if (session.payment_status !== "paid") return Response.json({ received: true, pending: true });
        payload.payment = checkoutPayment(session);
      }
    } else if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
      payload.subscription = await subscriptionSnapshot(supabase, stripe, (event.data.object as Stripe.Subscription).id);
    } else if (["invoice.payment_succeeded", "invoice.paid", "invoice.payment_failed"].includes(event.type)) {
      const invoice = await stripe.invoices.retrieve((event.data.object as Stripe.Invoice).id);
      const subId = stripeObjectId(invoice.subscription);
      if (subId) {
        const snapshot = await subscriptionSnapshot(supabase, stripe, subId);
        payload.subscription = snapshot;
        if (invoice.paid && invoice.status === "paid") payload.invoice = {
          invoice_id: invoice.id, user_id: snapshot.user_id, subscription_id: subId,
          amount: invoice.amount_paid, currency: invoice.currency,
          payment_intent_id: stripeObjectId(invoice.payment_intent), billing_reason: invoice.billing_reason,
        };
      }
    } else {
      return Response.json({ received: true, ignored: true });
    }
    const result = await applyBilling(supabase, payload);
    return Response.json({ received: true, result });
  } catch (error) {
    // Structured IDs and error only: never log full customer payload, card or auth data.
    console.error("[stripe-webhook] retry required", { eventId, error: error instanceof Error ? error.message : String(error) });
    return Response.json({ error: "Billing synchronization failed; retry required" }, { status: 500 });
  }
});
