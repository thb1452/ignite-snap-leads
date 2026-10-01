# Privileged access and provider containment

Status: implemented in the local relaunch branch; not deployed. No live writes,
provider sends, paid lookups, secret changes, or Lovable prompts were made.

## Changes and finding disposition

| Finding | Implemented change | Remaining release requirement |
|---|---|---|
| B01 digest credential / forced resend | Removed the committed credential branch and the force bypass. Digest requires an exact configured private credential, then returns `503 digest_held` before user lookup or delivery. | Replace any scheduler use of the retired credential; add durable recipient/period reservation, reviewed source authorization and provider outcome reconciliation before reopening delivery. |
| B02 unauthenticated maintenance | Eleven endpoints use an explicit, side-effect-free internal credential guard. Decoded JWT claims, ordinary user JWTs, public keys, cron hints and absent credentials do not authorize. Legacy test and migration routes return `410 endpoint_retired` even to authorized callers. Aggregate backfill has bounded batch size, concurrency and continuation cycles. | Update any unauthenticated cron invocation, deploy the verified bundle, then verify gateway behavior with isolated scheduler identities. Worker business idempotency is not established by these authorization tests. |
| B03 standalone paid tracing | The standalone enrichment and BYOA skip-trace entrypoints return `503 enrichment_held` before reading a property, credential or cache. | A unified property/source entitlement and atomic spending reservation system, including unknown-outcome reconciliation and cache ownership, must precede reopening. |
| B10 threaded SMS | Threaded SMS and its direct integration route are held before any database or provider action. Drip enrollment and execution are also held, including previously active enrollments. | Complete relation authorization, durable operation/message/activity handling, delivery reconciliation and recipient permission review before releasing communications. |
| B12 BYOA spending races | Paid entrypoints cannot reach the existing advisory cap or post-send dedup paths. The underlying reservation race is contained, not presented as repaired. | Implement atomic worst-case cost reservations and unique operations; account for concurrent requests, failed accounting and provider timeouts. |
| B15 service-client workspace bypass | BYOA authentication now validates a real customer identity and executes `fn_customer_workspace_ready_v1()` with the customer's JWT before accessing an integration or provider. Missing migration, failed verification, anonymous/deleted/banned accounts and unverified customer accounts fail closed. | Requires the coordinated customer-workspace migration and reviewed legacy-account provisioning. |
| ML08 support false success | Support reports `202 accepted` only when Resend returns no error and a nonempty message ID. Rejection and uncertain outcomes return 502; no automatic resend. HTML fields are escaped, Reply-To uses the Auth-verified email, and logs omit PII. The UI requires the acceptance contract, preserves a failed draft and makes no response-time promise. | Inbox delivery remains unverified until an authenticated provider webhook or an isolated inbox test establishes it. |

The digest and SMS/tracing gates are code-level decisions. Request flags and
environment switches cannot release them. Existing business implementations are
retained for a future reviewed repair; removing the hold alone is not a safe
release. Transactional/authentication email queue processing is not disabled;
its former decode-only role check was replaced with exact private-credential
verification. The proxy keep-warm endpoint similarly requires authentication.

## Credential contract and deployment dependencies

Internal endpoints accept one of these configured private credentials:

- The exact `SUPABASE_SERVICE_ROLE_KEY` as a Bearer token, `apikey`, or
  `x-internal-secret`. The configured public key must also exist, differ from it,
  and the private key must be at least 32 characters.
- The exact `INTERNAL_FUNCTION_SECRET` on `x-internal-secret`, with at least 32
  characters and different from the configured public key. Generate this outside
  source control and give the scheduler a Vault-backed reference.

The comparison does not decode a supplied JWT or trust its claimed role. No
user metadata is used for authorization. Comparisons accumulate character
differences rather than stopping on the first mismatched character.

`supabase/config.toml` sets `verify_jwt = false` explicitly for the eleven guarded
internal endpoints so that dedicated scheduler secrets and Supabase secret keys
can reach the handler's credential check. They must be deployed together with
the guard; deploying configuration alone is unsafe. Other customer routes retain
their existing gateway settings.

Production sequencing is still an approval/release gate: establish the private
scheduler credential and update authorized callers, deploy the guard and matching
configuration, then perform isolated gateway checks. Rotate any retired digest
scheduler credential and remove its old invocation configuration. No production
secret has been rotated by this workstream. Historical Git content is not erased.

The old browser backfill and migration widgets are intentionally unable to invoke
these service-only routes with a customer/admin JWT. A future operator interface
needs a separately reviewed operator action; do not place a service secret in the
browser. Aggregate backfill now defaults to one cycle, at most 500 records per
batch and five concurrent batches, with explicit `maxCycles` from 1 to 10. An
operator must schedule additional bounded work when needed.

## Verification

`node scripts/test-relaunch-security.mjs` passes **170 checks** against the actual
TypeScript handlers in isolated VMs. Supabase Auth, database clients, external
fetch and email delivery are replaced by observable stubs. No test network access
or real credentials are used.

Coverage includes:

- Eleven endpoints rejecting missing/invalid/ordinary-user/forged-role/public
  credentials and cron hints with zero Auth, database, RPC or provider work.
- GET rejection, missing/weak/equal-public secret configuration and an aborted
  request failing closed.
- All four private credential delivery forms reaching the synthetic queue worker.
- Authorized empty worker queues and an authorized synthetic signed keep-warm
  ping, with no real queue or provider used.
- All held send/trace paths returning the hold even for an authorized service
  caller with foreign/nonexistent property references and force/release flags.
- Authorized retired routes returning 410 without business work.
- Backfill input bounds and no unbounded self-continuation.
- BYOA workspace preflight denying before integration, Vault or provider access,
  and using the customer's JWT instead of the service key.

These are source/handler checks, not deployed gateway tests or delivery
certification. No concurrency-safe provider reservation, digest delivery claim,
or provider sandbox integration has been implemented or proven by this scope.

The same script also passes **14 support checks** (184 total): a returned provider
error, an error alongside a message ID, missing/blank IDs, a thrown transport
error, accepted-ID response, HTML and header injection, invalid/unverified identity,
invalid payload and absent provider configuration. Every send is a fake Resend
object; no email was sent. The frontend application type check also passes:
`npx tsc --noEmit -p tsconfig.app.json`.

The support function keeps the pinned Resend SDK 2.0.0 and fixes its reply field
to `reply_to`. The actual v2 interface was checked at
https://raw.githubusercontent.com/resend/resend-node/v2.0.0/src/emails/interfaces/create-email-options.interface.ts.
That interface returns `{ data: { id }, error }`; newer SDK examples use a
different camelCase reply field. Provider acceptance semantics were checked at
https://resend.com/docs/api-reference/emails/send-email.

Supabase reference consulted: https://supabase.com/docs/guides/functions/auth
(September 24, 2026). The root implementation workstream also checked the current
Supabase changelog before coordinated schema work.

## Changed files owned by this workstream

- `supabase/config.toml`
- `supabase/functions/_shared/internalWorkerAuth.ts`
- `supabase/functions/_shared/relaunchProviderHold.ts`
- `supabase/functions/_shared/byoa/auth.ts`
- `supabase/functions/backfill-property-aggregates/index.ts`
- `supabase/functions/distress-event-fanout/index.ts`
- `supabase/functions/drip-enroll/index.ts`
- `supabase/functions/drip-runner/index.ts`
- `supabase/functions/enrich-property-contact/index.ts`
- `supabase/functions/integration-revalidate/index.ts`
- `supabase/functions/integration-send-sms/index.ts`
- `supabase/functions/integration-skip-trace/index.ts` (hold only; tenancy workstream owns conflict-key fix)
- `supabase/functions/migrate-to-external/index.ts`
- `supabase/functions/process-email-queue/index.ts`
- `supabase/functions/send-sms-threaded/index.ts`
- `supabase/functions/send-support-message/index.ts`
- `supabase/functions/signal-delta-worker/index.ts`
- `supabase/functions/snap-mcp-keepwarm/index.ts`
- `supabase/functions/test-pipeline/index.ts`
- `supabase/functions/watchlist-fanout-worker/index.ts`
- `supabase/functions/weekly-digest/index.ts`
- `scripts/test-relaunch-security.mjs`
- `src/components/settings/HelpSection.tsx`
- `docs/relaunch/security-status.md`
