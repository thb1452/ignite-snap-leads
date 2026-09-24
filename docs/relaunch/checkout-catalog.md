# Checkout catalog configuration

New Checkout sessions use the deployed environment's reviewed catalog. There is no fallback to historical price IDs. The billing release gate remains closed by default, and property-unlock purchases remain held even if subscription/pack checkout is enabled for isolated testing.

## Subscription plans

Configure the environment's existing `subscription_plans` rows with the reviewed `stripe_price_id`, positive `price_monthly_cents` and `is_active=true`. Supported names are `starter`, `professional` and `enterprise`; requests using `pro` or `elite` resolve to the corresponding stored name.

Before any provider write, checkout verifies the reverse price-to-plan mapping is unambiguous and retrieves the selected Stripe Price. It must be active, belong to `STRIPE_EXPECTED_LIVEMODE`, be USD, match the row's monthly amount, and represent one licensed unit per month without quantity transforms or custom pricing. This exact database price mapping is also the first lookup used by webhook fulfillment. Historical fulfillment aliases are unchanged; they cannot supply a missing new-checkout catalog.

## Credit packs

Set server-only `STRIPE_BULK_PRICE_IDS` to a JSON object mapping supported credit counts to reviewed environment price IDs. Partial configuration is allowed; an unconfigured pack fails closed. Unknown keys, duplicate price IDs, malformed JSON and missing configuration are rejected. No environment-specific identifiers belong in this document or source control.

| Pack credits | Required USD price in cents |
|---:|---:|
| 5,000 | 75,000 |
| 10,000 | 130,000 |
| 20,000 | 220,000 |

Each selected provider price must be active, one-time, fixed per-unit USD pricing in the expected mode at the reviewed amount. Checkout uses quantity one and sets the pack metadata itself. Catalog validation does not replace signature, payment, ownership, receipt or fulfillment checks.

## Existing subscriptions and authentication

Trial conversion and plan changes require a canonical owned subscription in the expected mode with exactly one quantity-one item. Trial conversion also requires that item's existing price to equal the validated catalog price. Historical mismatches require review before a provider write. Accepted updates explicitly set the selected price and quantity one.

Authentication precedes Stripe configuration checks. Missing or invalid customer authorization returns 401 without constructing a Stripe client, checking the billing gate or writing provider data. An authenticated request can still fail for missing server configuration. Gateway JWT verification remains enabled.

## Verification

`node --test tests/billing/checkout-catalog.test.mjs` covers environment-price selection followed by exact fulfillment-plan resolution, aliases, invalid catalogs, provider mode/price/recurrence mismatches, existing-subscription safeguards and authorization ordering. Negative checkout cases assert zero provider writes; held requests also assert zero provider retrievals.

These are focused local tests with provider fixtures. Hosted checkout and signed paid-event acceptance must run separately in the reviewed isolated environment. No production configuration, catalog row, Stripe object or billing release gate was changed by this implementation.
