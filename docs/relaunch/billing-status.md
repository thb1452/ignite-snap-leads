# Billing implementation status — 2026-09-24

**Candidate code only. No production billing writes, charges, cancellation calls, deployments, balance edits, or Lovable prompts were executed. Checkout and customer data delivery remain held.**

## Implemented

- `create-checkout-session` calls a database release gate before creating a Stripe customer, checkout, plan change or portal upgrade. Missing migration, database error, missing approval reference, and default configuration all fail closed. New paid trials are disabled. Existing local trials and conflicting subscriptions are retained for reconciliation instead of being canceled by a purchase attempt.
- A service-only, invoker-rights billing RPC applies subscription synchronization, receipt, transaction, purchased pack grant, affiliate commission and processed-event marker in one PostgreSQL transaction. Errors propagate to the webhook as retryable failures. Existing webhook history and purchased pack ledger entries are honored.
- Stripe subscription identity has a unique index. Migration preflight **aborts on duplicate historical identities**; it never deletes or picks a winner. Multiple current subscriptions for one customer fail for review instead of cancelling an unrelated row.
- Webhooks retain raw-body signature verification and handle both completed checkout and delayed payment success. A completed but unpaid checkout does not fulfill. Each request fetches canonical current provider objects; database-issued monotonic sync tickets prevent an older concurrent fetch from overwriting a newer applied fetch. Terminal cancellation always wins for the same subscription identity, even if a slower lower-ticket fetch observes it. Event creation timestamps are not used as ordering guarantees.
- Subscription service periods come from paid, non-proration recurring invoice lines matching the current price. An unpaid higher plan cannot borrow an old plan's paid-through date. Period end never extends beyond verified payment. Trial synchronization preserves consumed usage and original trial start.
- The entitlement model is **subscription period allowance plus separately purchased wallet credits**. Renewal and proration invoices never deposit an additional full subscription allowance into the wallet. No historical credits are removed.
- `verify-subscription` requires a session belonging to the authenticated user or an existing provider mapping; it does not attach subscriptions by matching email alone. `verify-bulk-credits` retrieves the exact requested session, verifies payment and ownership, then uses the same atomic receipt path as the webhook.
- Checkout success distinguishes checking, confirmed and pending. It does not declare success from a URL parameter, an old active row, or a timeout. It does not fire a browser revenue event. The durable invoice receipt is available for future server-side conversion reporting; that external analytics delivery is not implemented.
- Existing billing portal access during the hold requires `STRIPE_MANAGEMENT_PORTAL_CONFIGURATION_ID`, and the provider configuration must be active with subscription updates disabled. No portal configuration was created or modified. Without a verified safe portal configuration, the endpoint asks the customer to contact support.
- Account deletion now records a closure request that blocks new purchases, cancels only verified owned subscriptions and checks the provider's final cancellation state. Any ambiguous mapping or cancellation failure retains local data. **Erasure is not complete:** successful cancellation returns `pending_retention_review`, and the UI accurately says deletion is pending. Financial records and private CRM are not partially deleted by a best-effort loop.
- Billing functions require explicit `STRIPE_EXPECTED_LIVEMODE`, with `true` for production and `false` only for an isolated sandbox. The secret key prefix, signed event mode and canonical provider object modes must agree; absent/inconsistent configuration fails closed. The candidate has not changed production configuration.

## Reconciliation result and limits

The public reconciliation process is recorded in [billing-canonical-reconciliation.md](billing-canonical-reconciliation.md). Detailed identities, classification counts, timestamps, invoice evidence, row hashes and exact-record proposals remain private. Read-only investigation distinguishes historical test evidence, verified current-provider mappings, unresolved identities and records without provider identity. No production reconciliation was applied.

**Absence is not evidence of cancellation.** Account/mode provenance and paid service periods must be verified independently. Preserve every balance and ledger record while ambiguous evidence is reviewed. An offline proposal and SELECT-only preflight are prepared, but any correction requires preserved before-images, reviewed provenance storage, rollback and exact-record approval.

`node scripts/reconcile-billing-readonly.mjs snapshot.json` accepts:

```json
{
  "observed_at": "2000-01-01T00:00:00Z",
  "provider_scope": {"account": "verified account label", "mode": "live"},
  "stripe_export_complete": true,
  "database_subscriptions": [],
  "stripe_subscriptions": []
}
```

The example timestamp and empty rows above are synthetic placeholders. Use read-only exports with all required pages. Database rows include id, user_id, status, stripe_subscription_id and current_period_end. Provider rows include id, status, metadata and normalized current_period_end. The script emits hashed record references, discrepancies and a scope caveat. It has no network or apply mode. Keep raw and pseudonymized row-level exports and reports outside the public repository.

## Verification

Run `node --test tests/billing/*.test.mjs` for the isolated PostgreSQL and provider-stub suite. It exercises real migration/function SQL with fixtures, pack/receipt idempotency, injected rollback, trial preservation, current-state ordering, period bounds, paid-plan proof, legacy preservation, account closure failures, hold enforcement, signature boundaries, and incomplete reconciliation snapshots.

The billing SQL/provider suite passed 30/30 tests after the mode guard change; `node --test tests/billing/reconciliation-review.test.mjs` passed six additional evidence-validation/read-only proposal tests. Root also ran the combined suite including these cases. **Actual Stripe tests remain blocked: zero provider payment tests and zero signed provider events exercised.** The prepared opt-in harness, attempted provisioning evidence and explicit limits are documented in `stripe-sandbox-tests.md` and `stripe-sandbox-verification-20260924.json`. Automatic approval review rejected new sandbox creation/email disclosure; the CLI also could not provision automatically and no browser signup was followed.

PGlite runs real PostgreSQL in one embedded connection. Concurrent JavaScript requests are queued there. The tests demonstrate idempotent replay and atomic rollback, **not a multi-backend lock-contention proof**. Provider requests can reach Stripe in a different order from ticket issuance; terminal states are explicitly protected, but nonterminal cross-process read ordering still needs staging validation. The separate native PostgreSQL CI now passes seven concurrency scenarios across three independent sessions; see [staging-verification.md](staging-verification.md) for its exact commit and artifact. Hosted migration and real Auth/PostgREST acceptance remain required before release. Provider methods in tests are stubs, not a Stripe sandbox checkout. The frontend typecheck passed after implementation.

## Release gates still open

1. Resolve private historical account/mode discrepancies and review ambiguous internal assignments. Approve preserved provenance and exact affected rows before any production reconciliation; the offline correction candidate remains unapplied.
2. Run hosted migration preflight against a fresh schema inventory and run Supabase database advisors in isolated staging. Native synthetic multi-connection tests passed at the recorded commit; repeat them for later SQL/harness changes. No production advisors or migration was executed here.
3. Run signed Stripe sandbox delivery including initial payment, renewal, trial conversion, unpaid asynchronous completion, paid upgrade/proration, failed payment, duplicate/out-of-order delivery and cancellation. Test deployed gateway authorization as well as handler authorization.
4. Define and review financial-record retention plus complete CRM/account erasure. This candidate intentionally retains data pending that decision; self-service full erasure is unavailable.
5. Test existing paid history/refunds/disputes and define reversal policy. No automatic clawback or refund call was added; disputed/refunded benefits must not be silently inferred from a canceled subscription.
6. Configure and verify a safe management portal; verify notification/support delivery for pending closure requests. No customer messages have been sent.
7. Demonstrate end-to-end paid delivery after market approval and account/privacy holds are resolved. Only then review checkout's database release row and frontend availability flags. No approval row is enabled by this migration.

Apply the migration before deploying the new functions because the functions require its RPCs. Configure the correct `STRIPE_EXPECTED_LIVEMODE` explicitly. Deploy into an isolated staging project first. Never roll the webhook back to the previous nontransactional renewal-grant handler after receipts begin: preserve the new receipt history and close checkout while investigating. Additive billing tables should not be dropped during rollback.

## Primary references consulted

- Stripe event ordering, duplicate deliveries, retries and signature verification: https://docs.stripe.com/webhooks
- Stripe subscription webhooks and payment status: https://docs.stripe.com/billing/subscriptions/webhooks
- Stripe checkout fulfillment: https://docs.stripe.com/checkout/fulfillment
- Supabase database functions and privileges: https://supabase.com/docs/guides/database/functions
- Supabase change index: https://supabase.com/changelog.md

The skill's generic Stripe reference URLs returned 404, so the current primary pages above were used. The existing Stripe SDK 14.21.0 and API 2023-10-16 are preserved for this compatibility-scoped repair. A version upgrade is a separate tested change.
