# Guarded staging and deployment runbook

Prepared 2026-09-24 for [PR 193](https://github.com/thb1452/ignite-snap-leads/pull/193), branch `codex/snap-relaunch-hardening-20260924`. **Release state: HOLD.** JD has authorized the relaunch work, including deployment once verification succeeds. This document records the execution gates and an unsent staging prompt; it adds no separate deployment permission requirement. JD approved the reviewed public candidate, free Stripe sandbox setup and one reviewed pilot qualification invitation. Lovable credit spending is expressly excluded. Other recipient ambiguities remain unresolved.

Record the final reviewed commit before execution; the branch is still being integrated. Native PostgreSQL concurrency passed at `bbfd18be090983a78207532d668984823cc76abc`, with seven races across three independent database sessions. The receipt is in [staging-verification.md](staging-verification.md). That receipt does not establish hosted Supabase, browser or Stripe acceptance. Candidate changes after that commit require matching verification.

## 1. Establish the environment boundary

| Environment | Observed state | Permitted role in this runbook |
| --- | --- | --- |
| Customer backend `[PRODUCTION_PROJECT_REF]` | Existing production backend; repository default | Read-only preflight until deployment gates pass; never a staging target |
| Operations backend `[OPERATIONS_PROJECT_REF]` | Existing operations/source archive | Preserve its access boundary; never clone into it, migrate it or use it as staging |
| PR 193 Vercel preview | Accessible after cloud sign-in; frontend falls back to the production backend when environment values are absent | Public presentation review only until a separate backend is explicitly configured and verified |
| Isolated hosted staging | Not yet provisioned or accepted | New, dedicated backend and frontend, synthetic accounts/data, independent secrets and disabled external jobs |

Lovable and Vercel sign-ins are available; the existing deployment authorization remains subject to verification and the explicit spending restrictions. **Ask JD for a specific credit ceiling and staging scope before any Lovable prompt, remix, generation, credit top-up or provisioning.** Do not assume Cloud operation is free. Use a separately created staging project, not the retiring Lovable Test/Live beta. Free Stripe sandbox setup is approved. Use the isolated account and exact-account/destination preflight described in [stripe-sandbox-tests.md](stripe-sandbox-tests.md); never reuse an old sandbox with unverified external event destinations.

- [ ] Record approval reference, final commit, operator, target project, frontend URL, allowed cost ceiling and time window in a private execution receipt.
- [ ] Confirm staging references differ from both production and Ops. Do not reuse production Auth, Vault, Storage, webhooks, service keys, provider accounts or scheduler destinations.
- [ ] Set both frontend Supabase variables explicitly before the first preview build. `src/integrations/supabase/client.ts` otherwise supplies production defaults. Verify browser Auth, REST, functions and realtime requests target only staging; do not exercise private flows on the current production-backed preview.
- [ ] Keep production auto-publish disconnected from this rehearsal. Merging PR 193 and publishing are separate actions.

## 2. Preserve a restorable baseline before migration

A schema listing, provider export or Git commit alone is not a restorable backup. No completed production restore rehearsal is claimed by this branch. The operator must preserve a restricted manifest with the following evidence before approving production changes:

- [ ] Managed database backup/snapshot identifier, UTC capture time, retention/access owner, supported restoration procedure and a verified restore into a separate disposable target. Record engine/version and extensions. The native CI fixture uses PostgreSQL 17.6; verify the approved hosted target independently.
- [ ] Schema and migration ledger, RLS/policies/grants, functions, triggers, constraints/indexes, publication configuration, and affected-table counts. Preserve private before-images for any subsequently approved account or subscription correction outside Git.
- [ ] Storage object originals and metadata, content hashes, source manifests/receipts and access policies. Prove required objects can be recovered; a database snapshot does not by itself prove object-byte recovery.
- [ ] Auth configuration/recovery procedure and a protected secret/configuration inventory using secret-manager references, not secret values. Include domains/redirects, scheduler definitions, webhook account/mode bindings and function versions.
- [ ] Restore verification receipt with catalog parity, relevant row counts, source-object hash checks and an owner-confirmed recovery procedure. Restored jobs/webhooks must remain disabled. No restored environment may send customer messages or call paid providers.

Use synthetic hosted fixtures for routine acceptance. If private production data is necessary for a restoration rehearsal, authorize that data movement separately and restrict the restore; never copy it into a broadly accessible preview. The selected native test fixture is not a complete managed Supabase clone.

Capture a fresh baseline before migration: signup-function definition/hash, existing RLS and constraints, duplicate Stripe subscription identities, cross-workspace relationship conflicts, source fences, scheduler names/timing/active states and function versions. Keep secret-bearing cron commands out of public evidence. Resolve drift deliberately; do not weaken the candidate preconditions.

## 3. Apply only the reviewed candidate migrations

Establish the known baseline in staging through the approved restore/schema process. Do not blindly replay every historical repository migration or run operations intake scripts to create a baseline. Then apply these three files in order through the approved platform migration mechanism, recording target, filename, checksum, result and timestamp:

| Order | Migration | Required result / stop condition |
| --- | --- | --- |
| 1 | `supabase/migrations/20260924182954_snap_customer_workspace_isolation_v1.sql` | Private workspace authority, restrictive legacy quarantine and relationship preservation. Signup drift, missing baseline objects or inconsistent relationships stop the transaction. |
| 2 | `supabase/migrations/20260924183006_snap_billing_atomic_fulfillment_v1.sql` | Atomic receipt/synchronization RPCs and closed release control. Duplicate historical subscription identities stop migration; no deletion or arbitrary winner is permitted. |
| 3 | `supabase/migrations/20260924183021_snap_crm_workflow_v1.sql` | Authorized, idempotent CRM workflow with concurrency control, manual outcomes and archival behavior. Must follow workspace isolation. |

- [ ] Check migration ledger and deployed definitions after each commit. Stop on any error; the three files are not one global transaction.
- [ ] Verify `snap_billing.release_controls.checkout_enabled` remains false. No approval reference or fulfillment timestamp is fabricated to open it.
- [ ] Run staging database advisors and review findings against the actual hosted schema. Preserve existing municipal source policies and holds.
- [ ] Run the service-only, read-only `SELECT * FROM public.fn_workspace_backfill_report_v1();` and preserve its result privately. Review staff, clean accounts and ownership conflicts separately.
- [ ] Provision only individually reviewed synthetic accounts during rehearsal. The mutating `public.fn_provision_customer_workspace_v1(p_user_id, p_review_reference)` requires bound parameters and a real review reference. Any production backfill needs an exact-account review after preflight; ambiguous ownership must be resolved with JD. Never loop blindly over profiles, reassign legacy business rows or delete conflicts to force success.

## 4. Configure and deploy a coordinated function bundle

Apply database dependencies before the new dependent handlers. Maintain a deployment window in which checkout/customer writes and old workers cannot run against a partially changed schema; record and verify the concrete pause/resume plan first. Preserve webhook delivery/retry history and reconcile events across the window. Do not roll a working transactional webhook back to the old nontransactional implementation.

| Configuration | Staging requirement | Production requirement before deployment |
| --- | --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Explicit separate backend URL and public key; inspect network destinations | Explicit intended customer backend; never a service key |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Platform values for staging only; backend-only service key | Verify project binding and availability without printing values |
| `INTERNAL_FUNCTION_SECRET` | Dedicated random secret, at least 32 characters, distinct from public key; scheduler stores secret-manager reference | Rotate retired digest invocation credentials and update authorized callers; never put a private credential in the browser |
| `STRIPE_EXPECTED_LIVEMODE` | Required literal `false` with an approved isolated test account | Required literal `true`; key prefix, signed event and retrieved object mode must agree |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Isolated test key and matching signed endpoint secret; supplied securely only after sandbox approval | Correct verified live account and webhook endpoint; preserve event/retry continuity |
| `STRIPE_MANAGEMENT_PORTAL_CONFIGURATION_ID` | Test-account configuration active with subscription updates disabled | Verified safe live management configuration; otherwise portal remains unavailable |
| `APP_URL` | Exact staging origin for return URLs; do not use localhost fallback | Exact approved production origin |
| Email, SMS, enrichment and AI provider credentials | Do not copy production credentials; any necessary auth/support test uses separately approved isolated delivery | Inventory existing references, preserve holds and approve any rotation independently |

Deploy these changed entrypoints with their shared modules from the same reviewed commit:

| Group | Functions | Gateway / execution requirement |
| --- | --- | --- |
| Private workers (11) | `backfill-property-aggregates`, `distress-event-fanout`, `drip-runner`, `integration-revalidate`, `migrate-to-external`, `process-email-queue`, `signal-delta-worker`, `snap-mcp-keepwarm`, `test-pipeline`, `watchlist-fanout-worker`, `weekly-digest` | `verify_jwt = false` **only with** the exact-private-credential handler guard. Configuration and handler must deploy together. Retired migration/test endpoints return 410. |
| Billing (6) | `create-checkout-session`, `create-portal-session`, `delete-user-account`, `verify-subscription`, `verify-bulk-credits`, `stripe-webhook` | Explicit mode guard plus migrated RPCs. Webhook remains signature-authenticated with `verify_jwt = false`; preserve authenticated gateway behavior on customer routes. |
| Customer/provider/export/support (7) | `drip-enroll`, `enrich-property-contact`, `export-user-data`, `integration-send-sms`, `integration-skip-trace`, `send-sms-threaded`, `send-support-message` | Preserve current authenticated gateway defaults/configuration and in-handler ownership checks; held paths stop before provider work. |

The shared deployment includes `internalWorkerAuth.ts`, `relaunchProviderHold.ts`, `byoa/auth.ts`, `accountExport.ts`, `billingClosure.ts`, `billingSync.ts` and `stripeMode.ts`. Recompute this manifest from the final diff before execution. Do not apply blanket `--no-verify-jwt` or redeploy unrelated legacy endpoints as a shortcut. Capture deployed versions/configuration, then build the frontend from the identical commit with explicit environment values.

Mandatory holds survive every environment and release rehearsal:

- SMS, tracing, drip and digest remain code-held in `relaunchProviderHold.ts`; no environment/request flag releases them. The underlying spend-reservation/delivery work is still incomplete.
- Upload/geocode/monitor execution, AI insight execution, single-property unlocking, source export privacy and List Scan spending reservations retain their existing guards. Do not remove them to satisfy a happy-path test.
- Checkout stays closed in the database and frontend. Missing migrations/configuration or failed verification fail closed. A payment receipt never authorizes municipal source evidence by itself.
- Transactional/auth email processing is not globally disabled by the provider hold. Keep staging queues and scheduler invocations inert until an isolated recipient/sink test is separately authorized. A support provider acceptance ID is not delivery proof.

## 5. Obtain hosted acceptance with two independent customer accounts

Use synthetic Customer A and Customer B, separate browsers/profiles, and distinct operator/VA fixtures. Record exact commit, target, test timestamp and sanitized result. Keep credentials and private bodies out of Git and screenshots. A frontend screenshot or passing stub test cannot replace the direct authenticated request checks.

| Acceptance | Required observed result |
| --- | --- |
| Signup and workspace authority | A and B receive different private workspaces and default stages. Client metadata cannot choose role/org. Profile identity, org credits and ownership registry cannot be rewritten. Anonymous, banned/deleted and unready legacy accounts fail closed. |
| Auth and browser lifecycle | Email-confirmation/login/reload/token refresh/sign-out behave truthfully. Switch A to B with requests in flight: no previous notes, messages, contact data, query results or saved outcome drafts appear. Role lookup error/timeout never grants a protected route. |
| REST/RPC/relationships | A cannot read/write B's leads, activities, stages, contacts, messages, integration references, exports or private source annotations by guessed IDs. Foreign stage/owner/actor/property relations fail. Run equivalent B-to-A checks. Service-owned authority functions remain unavailable to customer JWTs. |
| Staff boundary | Internal admin retains only intended operational access; ordinary customer/VA cannot enter shared customer CRM through old org membership. This release does not enable team invitations or customer VA delegation. |
| Source lineage and preservation | Exercise accepted, held, expired and revoked synthetic source fixtures. Exact approved handoff works; unauthorized evidence/export does not. Expiry/revocation removes source detail while retaining the owner's existing private lead, notes and follow-up IDs/content. No raw fallback or shared access is introduced. |
| Manual CRM journey | Existing permitted property/unlock to one lead; private contact/note; due/overdue next action; manual outcome replaces the action; reload shows one activity; archive/restore preserves IDs. Verify keyboard/mobile use and private export pagination beyond one page. |
| Uncertain outcome recovery | Lose the acknowledgement after commit, reload and retry the exact saved command: one activity only. Conflicting outcomes fail without partial work. After recovery expiry private draft text is purged and the unresolved receipt still prevents duplicate submission; account changes clear it. |
| Gateway and holds | Missing/public/forged/ordinary-user credentials cannot invoke workers. Valid isolated private credential reaches only the intended bounded worker. Held routes make zero external provider calls even with force/release flags. Wrong/missing Stripe mode fails before state mutation. |
| Actual billing sandbox | Signed initial payment, renewal, trial conversion, failed/unpaid/delayed payment, upgrade/proration, duplicate/out-of-order event, injected failure/retry and cancellation all use canonical ownership and atomic receipts. One purchase grants once; renewal does not duplicate wallet allowance. Browser checkout remains pending until durable verification. |
| Closure, support and retention | Ambiguous provider mapping/cancellation failure preserves local data. Confirmed cancellation results in pending retention review, not claimed erasure. Approved isolated support test distinguishes accepted, uncertain and delivered outcomes. |

Use the native PostgreSQL workflow again for any changed SQL/harness and preserve the exact-commit artifact. Hosted tests additionally cover real managed Auth/PostgREST/gateway/realtime behavior. Use the current [Stripe sandbox verification](stripe-sandbox-tests.md) for actual provider execution results. The separate [local Supabase HTTP check](local-supabase-ci.md) now passes real Auth, PostgREST and function-gateway scenarios in a disposable runner. Neither replaces hosted deployment, a restored backup or useful customer delivery.

## 6. Production deployment and release decisions

Before deploying under JD's existing authorization, attach a concrete receipt containing final commit, exact diff/function/config manifest, verified snapshot/restore, successful staging migration, hosted two-account evidence, signed sandbox results, native concurrency artifact, remaining exceptions and the rollback owner. Rerun the documented verification in [IMPLEMENTATION.md](IMPLEMENTATION.md) for the final candidate. A merge, accessible preview or Cloud sign-in does not satisfy these verification gates.

Deploying security repairs while checkout and unavailable features remain held is a separate decision from enabling paid delivery. A public paid relaunch additionally requires:

- [ ] Reviewed existing-account mapping/backfill and disposition of quarantined customers; no unresolved shared-data exposure.
- [ ] Canonical account/mode evidence for unresolved billing identities, retained before-images and approval of any exact-row reconciliation. Missing provider IDs do not mean cancelled; expired local active/trial labels do not prove paying users. The offline reconciliation proposal remains unapplied.
- [ ] Defined refund/dispute/reversal behavior, retention/erasure procedure and safe management portal; truthful closure/support behavior.
- [ ] Recovered original bytes with verified hash binding, independent original-backed review, resolution of requested-period discrepancies and explicit source acceptance. Candidate source records remain held until that acceptance. Use [market-validation.md](market-validation.md); never bypass Ops storage permissions or create a new download endpoint to retrieve originals.
- [ ] Demonstrated useful authorized paid delivery and private CRM preservation. Existing unlock/source/provider holds must only change through separately reviewed implementation and acceptance; this candidate has no blanket release switch.
- [ ] Approved pilot recipients/text, observed buyer tasks and return use as specified by [pilot/runbook.md](pilot/runbook.md). No recruitment or advertising runs as a deployment side effect.
- [ ] Record JD's existing deployment/relaunch authorization against the exact verified production candidate. Only after verified fulfillment and the other release gates can a reviewed action populate the release approval reference and timestamp and enable checkout; ask again only for new spending, destructive action or a material scope change.

After an approved production deployment, compare catalog/function versions, check privileged denials and holds, capture counts/receipts and reconcile webhook backlog without creating a new purchase. Reopen only the specifically approved surface. Stop immediately on cross-account visibility, wrong backend/mode, duplicate fulfillment, unexpected provider traffic, source leakage or lost private work.

## 7. Rollback without recreating shared access

1. Stop new entry/checkouts and affected schedules through the preapproved controls; preserve the code-level source/provider holds. Capture the failure and immutable billing/source/CRM receipts before repair.
2. If a migration transaction fails, inspect its actual commit state and ledger; do not assume earlier migration files rolled back. Correct the dependency with a reviewed forward repair. Do not drop conflicting rows or loosen constraints/RLS.
3. After workspace migration commits, preserve ownership receipts and private organizations. Never restore shared-org customer permissions, move customers back into the shared org, or remove source fences to make an old UI work.
4. After atomic billing starts, retain its tables/receipts and idempotency history. Never redeploy the old renewal-grant/nontransactional webhook. A previous frontend or handler is eligible only if reviewed for compatibility with the new schema and security rules; otherwise keep the affected feature unavailable and repair forward.
5. A disaster restore requires its own approved recovery window and verified snapshot. Restore into a private isolated target first; reconcile writes/events after the snapshot with durable identities before cutover. Database restore does not undo provider payments, cancellations or messages. Do not issue refunds, cancel subscriptions, replay sends or discard later customer work automatically.
6. Repeat affected hosted acceptance before reopening. Record remaining quarantined accounts and customer-impact handling; a partial recovery is not a completed relaunch.

## 8. Exact Lovable staging prompt — UNSENT

Fill the final commit, private environment references and explicitly approved credit ceiling in the approved private execution channel before presenting this prompt to Lovable. Never commit the filled private references to this public repository. Obtain JD's separate approval first. If any required authorization or value is absent, do not send it. This prompt requests staging only; it does not approve production or paid-provider testing.

```text
Create one isolated Snap Ignite staging environment for the reviewed GitHub candidate only.

Repository: thb1452/ignite-snap-leads
Pull request: 193
Branch: codex/snap-relaunch-hardening-20260924
Exact approved commit: [FINAL_REVIEWED_COMMIT]
Maximum authorized Lovable/Cloud credit spend for this task: [JD_APPROVED_CEILING]

Before making a chargeable change, confirm the planned project/backend resources and their cost against that ceiling. If cost cannot be bounded, stop and report the missing information. Do not buy credits, top up a workspace, upgrade a plan or provision extra services.

Create a separate staging project and backend. Do not use Lovable Test/Live beta. Do not mutate, deploy to, clone private customer data from or reuse credentials from the existing customer backend [PRODUCTION_PROJECT_REF] or the operations backend [OPERATIONS_PROJECT_REF]. Do not publish to a production domain or enable automatic production publication from main. Existing preview access is not proof of backend isolation.

Use the exact reviewed commit without generated feature changes. Follow docs/relaunch/deployment-runbook.md. Establish the reviewed baseline schema with synthetic fixtures only; if a compatible baseline is unavailable, stop with a precise blocker instead of replaying all historical migrations or weakening preconditions. Apply only the three candidate migrations in their documented order after the target and baseline are verified. Preserve every source/privacy/provider/checkout hold and restrictive workspace policy.

Configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY explicitly for the new backend before any private-flow preview. Verify Auth, REST, functions and realtime network destinations belong only to staging. Never expose a service key in frontend variables. Deploy only the documented candidate functions and matching gateway configuration together; no blanket authorization bypass. Keep schedulers, message delivery and paid-provider integrations inert. Use independent staging secrets delivered through the secure secret interface, never in prompts, source or logs.

Set STRIPE_EXPECTED_LIVEMODE=false. Do not connect a live Stripe account, create a Stripe sandbox, create payment objects, charge a card or trigger a webhook. If approved sandbox secrets are unavailable, leave billing fail-closed and report that blocker. Do not enable the database checkout release row or frontend paid availability. Do not import real customer identities, municipal originals or private receipts. Do not send invitations, support mail, authentication mail to real recipients, SMS, FOIA requests or advertisements.

Return the staging frontend URL, new backend reference, exact deployed commit, migration/function manifest, configuration-name checklist without values, observed credit use and blockers. Demonstrate backend separation using sanitized destinations. Do not declare hosted two-account, payment, market or relaunch acceptance complete until the runbook's actual evidence exists. Stop after the staging environment and receipt are ready for review; do not merge or publish production.
```
