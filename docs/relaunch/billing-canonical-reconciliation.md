# Billing reconciliation procedure and status

**Release state: HOLD. Read-only investigation and an unapplied remediation proposal are not production reconciliation.** No production subscription, provider object, balance, price, paid-through date or entitlement was changed.

The private review distinguishes historical test evidence, verified current-provider mappings, unresolved account/mode identities and records without provider identity. Detailed account references, subscription timestamps, invoice history, financial totals, row hashes and classification counts are retained outside this public repository.

Follow-up read-only retrievals in the confirmed historical sandbox and the business account's separate legacy shared Test mode did not locate the unresolved subscription identities. Sampled subscriptions with known historical test-event evidence were also absent from both reviewed test scopes. Account identity and test-key mode were verified before each bounded check; no complete legacy Test mode inventory is claimed. These results leave the identities unresolved; absence does not establish cancellation, nonpayment or test classification. The evidence remains private, and the correction proposal remains unapplied.

## Required interpretation

- A missing identity in one provider account/mode does not prove cancellation or nonpayment.
- Stored historical event mode is evidence of that event; it does not establish current provider status or reverify the original event signature.
- Provider period end alone cannot extend paid-through access. Verify qualifying paid invoice service periods separately.
- Preserve purchased-credit ledgers and balances when original checkout evidence is incomplete.
- Do not recreate deleted users, merge identities or reactivate service from a provider record alone.

## Reviewable correction workflow

`scripts/prepare-billing-reconciliation-review.mjs` consumes private evidence offline and emits a private proposed correction plus read-only preflight SQL. It has no network, execution or apply mode. The proposal is unapplied.

Before any correction, retain exact private before-images, canonical account/mode/payment provenance, a reviewed audit destination and rollback procedure. Re-run the SELECT-only preflight and approve the exact affected records. Unresolved identities require investigation or an explicitly reviewed quarantine policy. Never infer a safe mass update from aggregate status counts.

Keep both raw and pseudonymized record-level reports outside Git. Hashing a record identifier does not make its status, timestamps or financial history suitable for public release.

## Preventing test/live mixing

Candidate billing functions require explicit `STRIPE_EXPECTED_LIVEMODE=true` for production or `false` for isolated sandbox testing. The secret-key prefix, signed event mode and retrieved subscription/invoice/checkout/customer modes must agree. Missing or inconsistent configuration fails closed. Production configuration was not changed.

## Verification limits

Offline reconciliation tests pass; they verify evidence classification and proposal/preflight safety using fixtures. See [sandbox status](stripe-sandbox-tests.md) for the current real-provider execution results and limitations. Native synthetic PostgreSQL concurrency is separately documented in [staging verification](staging-verification.md). Those checks do not by themselves prove hosted payment-to-delivery or resolve private historical identities.
