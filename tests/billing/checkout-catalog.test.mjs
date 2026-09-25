import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';

function moduleUrl(path, replacements = {}) {
  let source = readFileSync(new URL(path, import.meta.url), 'utf8');
  for (const [from, to] of Object.entries(replacements)) source = source.replace(from, to);
  return 'data:text/javascript;base64,' + Buffer.from(ts.transpile(source, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 })).toString('base64');
}
const modeUrl = moduleUrl('../../supabase/functions/_shared/stripeMode.ts');
const mode = await import(modeUrl);
const catalog = await import(moduleUrl('../../supabase/functions/_shared/checkoutCatalog.ts', { './stripeMode.ts': modeUrl }));
const planUrl = moduleUrl('../../supabase/functions/_shared/stripeSubscriptionPlan.ts');
const resolver = await import(planUrl);
const sync = await import(moduleUrl('../../supabase/functions/_shared/billingSync.ts', { './stripeMode.ts': modeUrl, './stripeSubscriptionPlan.ts': planUrl }));
const plan = { id: 'plan-fixture', name: 'professional', display_name: 'Pro', is_active: true, stripe_price_id: 'price_sandboxPro', price_monthly_cents: 9900 };
const price = { id: plan.stripe_price_id, active: true, livemode: false, currency: 'usd', unit_amount: 9900, billing_scheme: 'per_unit', type: 'recurring', recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' }, transform_quantity: null, custom_unit_amount: null };
function database({ selected = plan, reverse = selected, error = null, reverseError = null, gate = true, existing = null } = {}) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-fixture', email: 'fixture@example.invalid' } }, error: null }) },
    rpc: async () => ({ data: gate, error: null }),
    from(table) {
      const query = { column: null, select() { return this; }, eq(column) { this.column = column; return this; }, in() { return this; }, not() { return this; }, limit() { return this; },
        async maybeSingle() {
          if (table !== 'subscription_plans') return { data: existing, error: null };
          return this.column === 'stripe_price_id' ? { data: reverse, error: reverseError } : { data: selected, error };
        },
      };
      return query;
    },
  };
}
function checkoutHandler({ db = database(), providerPrice = price, rawCatalog = '{"5000":"price_packFixture"}', stripeKey = 'sk_test_fixture', currentSubscription = null } = {}) {
  const calls = { reads: 0, constructed: 0, writes: [], sessions: [], subscriptionUpdates: [] };
  class Stripe {
    constructor() { calls.constructed++; }
    static createFetchHttpClient() { return {}; }
    prices = { retrieve: async () => { calls.reads++; if (providerPrice instanceof Error) throw providerPrice; return providerPrice; } };
    customers = {
      list: async () => ({ data: [] }),
      retrieve: async () => { calls.reads++; return { id: 'cus_fixture', livemode: false, metadata: { supabase_user_id: 'user-fixture' } }; },
      create: async data => { calls.writes.push('customer'); return { id: 'cus_fixture', metadata: data.metadata }; },
    };
    subscriptions = {
      retrieve: async () => { calls.reads++; return currentSubscription; },
      update: async (id, payload) => { calls.writes.push('subscription'); calls.subscriptionUpdates.push({ id, payload }); return { ...currentSubscription, status: 'active', pending_update: null, latest_invoice: { id: 'in_fixture', status: 'paid', amount_due: 0 } }; },
    };
    checkout = { sessions: { create: async data => { calls.writes.push('checkout'); calls.sessions.push(data); return { id: 'cs_fixture', url: 'https://checkout.example.invalid/fixture' }; } } };
  }
  let handler;
  const source = readFileSync(new URL('../../supabase/functions/create-checkout-session/index.ts', import.meta.url), 'utf8').replace(/^import .*;\s*$/gm, '');
  const deno = { serve: fn => { handler = fn; }, env: { get: name => ({ STRIPE_SECRET_KEY: stripeKey, STRIPE_EXPECTED_LIVEMODE: 'false', STRIPE_BULK_PRICE_IDS: rawCatalog, SUPABASE_URL: 'https://db.example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture', APP_URL: 'https://app.example.invalid' })[name] } };
  const extra = { expectedStripeMode: mode.expectedStripeMode, ...catalog };
  new Function('Deno', 'createClient', 'Stripe', ...Object.keys(extra), ts.transpile(source, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }))(deno, () => db, Stripe, ...Object.values(extra));
  const invoke = (body, authorization = 'Bearer fixture') => handler(new Request('https://app.example.invalid/checkout', { method: 'POST', headers: { ...(authorization ? { authorization } : {}), apikey: 'sb_publishable_fixture', 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { calls, invoke };
}

test('new subscription checkout selects environment DB price and fulfillment resolves the same paid plan', async () => {
  const db = database();
  const h = checkoutHandler({ db });
  assert.equal((await h.invoke({ tier_name: 'pro' })).status, 200);
  assert.deepEqual(h.calls.sessions[0].line_items, [{ price: plan.stripe_price_id, quantity: 1 }]);
  assert.equal(h.calls.sessions[0].subscription_data.metadata.plan_id, plan.id);
  const subscription = { id: 'sub_fixture', items: { data: [{ id: 'si_fixture', price }] } };
  const resolved = await resolver.resolvePlanFromStripeSubscription(db, subscription);
  assert.equal(resolved.planId, plan.id);
  assert.equal(resolved.priceId, plan.stripe_price_id);
  assert.equal(resolved.source, 'subscription_plans.stripe_price_id');
  assert.equal(sync.paidPlanVerified({ paid: true, status: 'paid', lines: { data: [{ type: 'subscription', subscription: subscription.id, price, proration: false, amount: 9900 }] } }, subscription, resolved.priceId), true);
});

test('elite alias selects the enterprise catalog while arbitrary or privileged names fail closed', async () => {
  const selected = { ...plan, name: 'enterprise' };
  const result = await catalog.subscriptionCheckoutCatalog(database({ selected }), { prices: { retrieve: async () => price } }, 'elite', false);
  assert.equal(result.plan.name, 'enterprise');
  for (const tier of ['enterprise_admin', 'unknown', null, {}]) {
    const h = checkoutHandler(); await h.invoke({ tier_name: tier });
    assert.deepEqual(h.calls.writes, []); assert.equal(h.calls.reads, 0);
  }
});

test('missing, inactive or ambiguous subscription catalog prevents all provider writes', async () => {
  for (const config of [
    { selected: null }, { selected: { ...plan, is_active: false } }, { selected: { ...plan, stripe_price_id: null } },
    { selected: { ...plan, price_monthly_cents: 0 } }, { error: new Error('database unavailable') },
    { reverse: { id: 'another-plan', name: plan.name } }, { reverseError: new Error('duplicate price mappings') },
  ]) {
    const h = checkoutHandler({ db: database(config) });
    assert.notEqual((await h.invoke({ tier_name: 'professional' })).status, 200);
    assert.deepEqual(h.calls.writes, []);
  }
});

test('selected provider price must match mode, amount, currency and monthly fixed-price terms before writes', async () => {
  for (const mismatch of [
    { id: 'price_other' }, { active: false }, { livemode: true }, { livemode: undefined }, { currency: 'eur' },
    { unit_amount: 4900 }, { unit_amount: null }, { billing_scheme: 'tiered' }, { transform_quantity: { divide_by: 5 } },
    { custom_unit_amount: { enabled: true } }, { type: 'one_time', recurring: null },
    { recurring: { ...price.recurring, interval: 'year' } }, { recurring: { ...price.recurring, interval_count: 2 } },
    { recurring: { ...price.recurring, usage_type: 'metered' } },
  ]) {
    const h = checkoutHandler({ providerPrice: { ...price, ...mismatch } });
    assert.notEqual((await h.invoke({ tier_name: 'pro' })).status, 200);
    assert.equal(h.calls.reads, 1); assert.deepEqual(h.calls.writes, []);
  }
  const h = checkoutHandler({ providerPrice: new Error('price not found in this account') });
  await h.invoke({ tier_name: 'pro' }); assert.deepEqual(h.calls.writes, []);
});

const packPrice = { ...price, id: 'price_packFixture', unit_amount: 75000, type: 'one_time', recurring: null };
test('bulk checkout uses explicit environment price with fixed pack quantity and metadata', async () => {
  const h = checkoutHandler({ providerPrice: packPrice });
  assert.equal((await h.invoke({ checkout_type: 'bulk_credits', credit_count: 5000 })).status, 200);
  const session = h.calls.sessions[0];
  assert.deepEqual(session.line_items, [{ price: packPrice.id, quantity: 1 }]);
  assert.equal(session.metadata.credit_count, '5000');
  assert.equal(session.metadata.user_id, 'user-fixture');
  assert.equal(session.mode, 'payment');
});

test('bulk catalog has no default and rejects malformed, unsupported, duplicate or missing mappings before writes', async () => {
  for (const rawCatalog of ['', '{', 'null', '[]', '{}', '{"unknown":"price_packFixture"}', '{"10000":"price_other"}', '{"5000":""}', '{"5000":"price_same","10000":"price_same"}']) {
    const h = checkoutHandler({ providerPrice: packPrice, rawCatalog });
    assert.notEqual((await h.invoke({ checkout_type: 'bulk_credits', credit_count: 5000 })).status, 200);
    assert.deepEqual(h.calls.writes, []); assert.equal(h.calls.reads, 0);
  }
});

test('bulk price cannot charge another amount, mode, currency or recurring subscription', async () => {
  for (const mismatch of [{ unit_amount: 37500 }, { livemode: true }, { currency: 'eur' }, { type: 'recurring', recurring: price.recurring }]) {
    const h = checkoutHandler({ providerPrice: { ...packPrice, ...mismatch } });
    assert.notEqual((await h.invoke({ checkout_type: 'bulk_credits', credit_count: 5000 })).status, 200);
    assert.deepEqual(h.calls.writes, []);
  }
});

test('billing hold blocks every provider retrieval and write; single unlock remains held with billing enabled', async () => {
  for (const body of [{ tier_name: 'pro' }, { checkout_type: 'bulk_credits', credit_count: 5000 }, { checkout_type: 'single_unlock', property_id: 'fixture' }]) {
    const h = checkoutHandler({ db: database({ gate: false }) });
    assert.equal((await h.invoke(body)).status, 503);
    assert.equal(h.calls.reads, 0); assert.deepEqual(h.calls.writes, []);
  }
  const h = checkoutHandler();
  assert.equal((await h.invoke({ checkout_type: 'single_unlock', property_id: 'fixture' })).status, 503);
  assert.equal(h.calls.reads, 0); assert.deepEqual(h.calls.writes, []);
});

test('missing, anonymous or forged authorization returns 401 before absent Stripe configuration or provider access', async () => {
  for (const authorization of [null, 'Basic fixture', 'Bearer sb_publishable_fixture', 'Bearer forged-jwt', 'Bearer anonymous-key']) {
    const db = database(); let gateCalls = 0;
    db.auth.getUser = async () => ({ data: { user: null }, error: new Error('invalid user token') });
    db.rpc = async () => { gateCalls++; throw new Error('auth should reject before gate'); };
    const h = checkoutHandler({ db, stripeKey: null });
    assert.equal((await h.invoke({ tier_name: 'pro' }, authorization)).status, 401);
    assert.equal(h.calls.constructed, 0); assert.equal(h.calls.reads, 0);
    assert.deepEqual(h.calls.writes, []); assert.equal(gateCalls, 0);
  }
  const h = checkoutHandler({ stripeKey: null });
  assert.equal((await h.invoke({ tier_name: 'pro' })).status, 500);
  assert.equal(h.calls.constructed, 0); assert.deepEqual(h.calls.writes, []);
});

const existingRow = { id: 'native-fixture', stripe_subscription_id: 'sub_fixture', stripe_customer_id: 'cus_fixture', status: 'trialing', plan_id: plan.id };
const canonicalTrial = { id: 'sub_fixture', livemode: false, customer: 'cus_fixture', metadata: { user_id: 'user-fixture' }, status: 'trialing', items: { data: [{ id: 'si_fixture', price, quantity: 1 }] } };
test('existing trial must match actual catalog price and owned single-unit subscription before conversion', async () => {
  for (const currentSubscription of [
    { ...canonicalTrial, items: { data: [{ ...canonicalTrial.items.data[0], price: { ...price, id: 'price_legacy' } }] } },
    { ...canonicalTrial, items: { data: [{ ...canonicalTrial.items.data[0], quantity: 2 }] } },
    { ...canonicalTrial, items: { data: [...canonicalTrial.items.data, { ...canonicalTrial.items.data[0], id: 'si_extra' }] } },
    { ...canonicalTrial, livemode: true }, { ...canonicalTrial, customer: 'cus_foreign' },
    { ...canonicalTrial, metadata: { user_id: 'someone-else' } }, { ...canonicalTrial, status: 'past_due' },
  ]) {
    const h = checkoutHandler({ db: database({ existing: existingRow }), currentSubscription });
    assert.equal((await h.invoke({ tier_name: 'pro' })).status, 400);
    assert.deepEqual(h.calls.writes, []);
  }
  const h = checkoutHandler({ db: database({ existing: existingRow }), currentSubscription: canonicalTrial });
  assert.equal((await h.invoke({ tier_name: 'pro' })).status, 200);
  assert.deepEqual(h.calls.writes, ['subscription']);
  assert.deepEqual(h.calls.subscriptionUpdates[0].payload.items, [{ id: 'si_fixture', price: price.id, quantity: 1 }]);
});

test('existing upgrade refuses extra quantity/items before update or portal fallback', async () => {
  const existing = { ...existingRow, status: 'active', plan_id: 'old-plan' };
  const current = { ...canonicalTrial, status: 'active' };
  for (const items of [[], [{ ...current.items.data[0], quantity: 2 }], [...current.items.data, { ...current.items.data[0], id: 'si_extra' }]]) {
    const h = checkoutHandler({ db: database({ existing }), currentSubscription: { ...current, items: { data: items } } });
    assert.equal((await h.invoke({ tier_name: 'pro' })).status, 400);
    assert.deepEqual(h.calls.writes, []);
  }
  const h = checkoutHandler({ db: database({ existing }), currentSubscription: current });
  assert.equal((await h.invoke({ tier_name: 'pro' })).status, 200);
  assert.deepEqual(h.calls.writes, ['subscription']);
  assert.deepEqual(h.calls.subscriptionUpdates[0].payload.items, [{ id: 'si_fixture', price: price.id, quantity: 1 }]);
});
