# Isolated Stripe sandbox verification

**Selected sandbox billing suite: PASS — 13 checks passed, none failed. Customer release remains HOLD.** The completed run exercised real test-mode payments and authentic signed Stripe events against the candidate webhook handler, corrected billing helpers and isolated SQL. This is not hosted deployment, browser Checkout or usable property-delivery acceptance. See `stripe-sandbox-verification-20260924.json`.

The earlier anonymous CLI provisioning route failed. Authorized, authenticated Dashboard setup subsequently created a new blank sandbox without copying live configuration. A complete read-only preflight verified the intended test account and found no configured v1 webhook endpoints or v2 event destinations before writes. Credentials and account references remain private.

## Passing checks

1. Checkout's release gate remained closed.
2. A genuine completed test Checkout granted exactly one purchased credit pack.
3. Replaying its authentic signed event did not grant credits twice.
4. An invalid signature could not modify receipts.
5. An injected database failure rolled back; authentic-event replay committed once.
6. An initial paid subscription invoice established allowance without wallet credits.
7. A paid-proration upgrade changed the plan without duplicate allowance.
8. A clock-driven renewal extended paid-through access once without changing the wallet.
9. Cancellation followed by first delivery of an earlier authentic event did not resurrect access.
10. Trial conversion preserved recorded usage and established the paid service period.
11. Failed payment did not establish paid subscription access.
12. A paid single-property test event retained the fulfillment hold and remained retryable.
13. Delayed Checkout remained pending at initial delivery, then asynchronous payment success granted exactly one pack and receipt.

An earlier provider run exposed the paid-proration mismatch: the pinned Stripe API represents the upgrade debit as an `invoiceitem` proration line. The corrected helper requires a positive paid debit matching the current subscription, item, price and service term. It rejects unrelated items, old-plan credits and unpaid invoices; proration does not extend paid-through access. The focused local billing regression suite passed 32 results, and the complete provider rerun above verified the correction.

An intermediate run was interrupted when automatic approval review flagged a CLI request to GitHub. Source inspection confirmed a fixed public release-version lookup without authentication, request body or customer/credential data. That concern was resolved before the completed run; no execution block remains for this recorded result.

No live charges or production billing writes occurred. No Lovable generation prompts or new Lovable provisioning were initiated; existing hosted runtime consumption was not measured. Checkout and customer delivery remain held.

## Harness and reproduction

`scripts/test-stripe-sandbox.mjs` uses Stripe SDK **14.21.0**, API **2023-10-16**, and official CLI package **1.51.1**. Signed forwarding invokes the candidate `stripe-webhook` handler and shared helpers. Only the Supabase transport is replaced: RPC and plan/mapping reads execute in isolated PGlite PostgreSQL with the selected schema fixture and actual candidate migration.

The harness creates synthetic products, prices, customers, payment methods, subscriptions, clocks and Checkout sessions only in the approved sandbox. It refuses live keys and requires the exact intended account plus complete destination preflight before writes. Existing external destinations are never disabled to make an environment appear isolated. Checkout completion uses official CLI fixtures, not interactive browser/card entry.

Use the existing approved blank sandbox and isolated CLI configuration. Supply these variables through a secret-safe process environment:

| Variable | Required value |
|---|---|
| `SNAP_STRIPE_SANDBOX_KEY` | Approved isolated sandbox test key |
| `SNAP_STRIPE_EXPECTED_ACCOUNT` | Privately verified intended sandbox account identity |
| `SNAP_STRIPE_CLI` | Absolute path to the official CLI executable |
| `SNAP_STRIPE_RUNTIME` | Scratch npm prefix containing pinned Stripe SDK |
| `SNAP_STRIPE_SANDBOX_REPORT` | Private JSON execution-receipt path |

Run `node scripts/test-stripe-sandbox.mjs` only in that approved scope. Never supply credentials as command-line arguments or commit local environment/configuration files. Account/customer/event identities, keys, signatures, raw payloads and private evidence stay outside this public repository. Publish only reviewed status and test summaries.

## Remaining acceptance

This passing run establishes the selected provider lifecycle against the candidate handler and isolated SQL. It does not establish hosted Supabase deployment/configuration, browser Checkout UX, production migration, financial reversal policy or useful property delivery.

Native PostgreSQL concurrency and real local Auth/PostgREST/gateway checks passed separately in [staging verification](staging-verification.md) and [local Supabase CI](local-supabase-ci.md). They do not constitute a deployed hosted backend. Market/privacy acceptance, the customer delivery journey and buyer pilot remain independent gates. Release controls stay closed.

Official references: [Stripe sandboxes](https://docs.stripe.com/sandboxes), [signed local forwarding](https://docs.stripe.com/cli/listen), [test fixtures](https://docs.stripe.com/cli/trigger), [test clocks](https://docs.stripe.com/billing/testing/test-clocks), and [fulfillment](https://docs.stripe.com/checkout/fulfillment).
