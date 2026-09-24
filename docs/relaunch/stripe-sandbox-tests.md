# Isolated Stripe sandbox verification

**Status: BLOCKED; zero real-provider payment tests ran.** The harness and isolated SQL bootstrap are prepared. A prepared script is not a passed payment test. See `stripe-sandbox-verification-20260924.json` for the sanitized attempt receipt.

Two blockers were observed:

1. Automatic approval review rejected new external account creation because that setup required separate authorization. No retry or indirect provisioning route was attempted after rejection.
2. The CLI's captured attempt output reported that automatic provisioning was unavailable and fell back to browser signup. No test key or claim URL appeared. Browser launch was disabled, no signup was followed, and no provisioning process remained. Explicit sandbox approval alone therefore would not establish that automated provisioning will work.

An approved, usable isolated Stripe sandbox with securely supplied test credentials is still required. No production account was modified, no live payment was attempted and no new staging resource was provisioned. Future credit spending requires owner approval.

`scripts/test-stripe-sandbox.mjs` is opt-in and refuses keys whose prefix is not explicitly test-only. It connects the real Stripe SDK **14.21.0**, API **2023-10-16**, and Stripe CLI signed event forwarding to the unchanged `stripe-webhook` handler and shared billing helpers. Only the Supabase transport is replaced: RPC and plan/mapping reads execute in isolated PGlite PostgreSQL using the shared captured-schema billing fixture and the actual candidate migration.

The script tests:

- Closed checkout release gate.
- Genuine Checkout completion and one purchased pack grant.
- Signed duplicate replay and invalid-signature rejection.
- Injected SQL failure, rollback, and authentic-event retry.
- Initial subscription payment, paid proration upgrade, and clock-driven renewal without duplicate wallet allowance.
- Cancellation followed by first delivery of an earlier authentic subscription-created event.
- Trial conversion with preserved usage.
- Failed card payment without paid access.
- A synthetic paid single-property event remaining held.
- Delayed Checkout completion remaining pending until asynchronous payment success, if the disposable sandbox supports the needed dynamic payment method.

The source creates test products, prices, customers, payment methods, subscriptions, clocks and Checkout sessions in the disposable sandbox. It never accepts live keys or connects to a production database. It uses official Stripe CLI test fixtures, not an interactive browser/card entry flow. Test identity values are synthetic. Secret keys, webhook secrets and sandbox claim URLs must stay outside Git, logs, and receipts.

## Run

Install the CLI in scratch using the currently retrievable official package. `@stripe/cli@1.52.0` advertised in npm metadata returned a 404 tarball; `@stripe/cli@1.51.1` installed successfully. Use an already approved isolated sandbox or obtain explicit approval for new account creation and any required identity disclosure. Discover `stripe sandbox create --help` before an approved creation attempt, use isolated CLI configuration, capture output privately and verify test-only identity. Do not place an account identity in this public runbook. Do not use the live Stripe MCP connection after anonymous sandbox creation; that connection requires the documented claim/authentication process before reuse.

Install `stripe@14.21.0` in a separate scratch npm prefix. Supply these environment variables through a secret-safe process environment:

| Variable | Required value |
|---|---|
| `SNAP_STRIPE_SANDBOX_KEY` | Newly provisioned sandbox test key |
| `SNAP_STRIPE_CLI` | Absolute path to the official Stripe CLI executable |
| `SNAP_STRIPE_RUNTIME` | Scratch npm prefix containing `stripe@14.21.0` |
| `SNAP_STRIPE_SANDBOX_REPORT` | Private path for the JSON execution receipt |

Run `node scripts/test-stripe-sandbox.mjs`. Never supply credentials as command-line arguments or commit a local environment/config file. The private receipt may contain test object/event IDs, results, handler responses, scope and limitations; it must omit keys, signatures, event payloads, customer names and claim links. Publish only an aggregate-free status/test summary after review, not account or event identities.

## Evidence limits

Passing this harness proves the selected real-provider billing events exercised the actual candidate handler and SQL. It does not prove hosted Supabase gateway authorization, deployment/configuration, browser Checkout UX, production schema migration, independent database connections, financial reversal policy, or delivery of usable property data. The release control stays closed. Native PostgreSQL multi-connection testing passed separately at the commit recorded in [staging-verification.md](staging-verification.md). Market/privacy approval and a customer delivery journey are independent release gates.

Official references: [Stripe sandboxes](https://docs.stripe.com/sandboxes), [sandbox CLI](https://docs.stripe.com/cli/sandbox), [signed local forwarding](https://docs.stripe.com/cli/listen), [real API fixture events](https://docs.stripe.com/cli/trigger), [test clocks](https://docs.stripe.com/billing/testing/test-clocks), and [fulfillment](https://docs.stripe.com/checkout/fulfillment).
