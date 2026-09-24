# Snap Ignite relaunch repairs — 2026-09-24

**Release state: HOLD. This branch contains implementation and isolated verification, not a deployed relaunch.**

Base: `16c1397507026d1eb03bebec7c7aec08d45ec2ee`. Branch: `codex/snap-relaunch-hardening-20260924`.

JD authorized the five-step execution order. Work used source edits, read-only native inspection, synthetic provider responses, and isolated PostgreSQL. No production records, subscription balances, source acceptances, secrets, deployments, provider sends, outreach or advertising were changed. No Lovable generation prompt or credit spend occurred. Ask JD before any future Lovable credit spend.

## Execution status

| Requested step | Implemented or established | Still required |
| --- | --- | --- |
| 1. Customer separation and privileged access | Private workspace signup, restrictive legacy quarantine, reviewed per-user provisioning, relationship constraints, privileged endpoint authentication, account cache clearing and explicit role checks. | Staging baseline/backup, deployment, reviewed existing-account mapping/backfill, actual two-account Auth/PostgREST/browser checks and scheduler secret rotation. |
| 2. Billing and payment-to-delivery | Atomic receipts and purchased credits, paid-plan proof, duplicate/reordered-event handling, truthful checkout verification, cancellation-first closure, all-status read-only reconciliation. | Resolve provider identity/account discrepancies; signed Stripe sandbox journeys, independent-session races, retention/erasure and approved market delivery. |
| 3. One market | Madison Heights private import examined; original-to-import verifier and stratified review plan implemented. | September 23 original source bytes and 90 pre-import exception records, human original review, approved source lineage. Market remains unapproved. |
| 4. Existing CRM | Private daily pipeline, action/date/deal editor, multiple private contacts, atomic manual outcomes, archive/restore, mobile handoff, private export and retained notes after source revocation. | Hosted migration and signed-in desktop/mobile acceptance; independent-session retry/locking and actual reviewed-source receipt tests. |
| 5. Public promises and small buyer pilot | Claims and availability aligned with holds; public metadata/navigation repaired; telemetry sanitized; five-task pilot runbook/scorecard prepared. | Browser visual/keyboard checks, approved participants, market/product gates, actual moderated and return-use sessions. No pilot results or outreach are claimed. |

## Important findings from fresh inspection

- Private Madison Heights records: **242 cases — 136 complied, 39 violation, 19 no violation seen, 3 cancelled and 45 status unspecified.** These are neither 242 active violations nor approved customer inventory. The intake receipt reports 332 original cases and 90 pre-import exceptions. Stored consistency checks do not establish original-source accuracy.
- Connected live Stripe account: **11 subscriptions, all canceled, complete pagination.** Native database: 59 rows, including 31 labeled active and 9 trialing. Eight provider identities match with normalized status agreement; 48 native IDs are absent from this account/mode and three rows have no provider ID. Absence is not proof of cancellation. All 40 local active/trialing rows have expired local periods at this observation. No row was automatically changed and local status counts are not MRR.
- Browser: the user's existing signed-in Lovable tab is not attached to the controllable cloud browser. A local candidate preview was also refused with `net::ERR_BLOCKED_BY_CLIENT`. Authenticated and visual browser acceptance remains unverified; no repeat login request or browser workaround was attempted.

## Verification and reproduction

Run from repository root with the lockfile dependencies installed:

```sh
node --test tests/*.test.mjs tests/billing/*.test.mjs
node scripts/test-relaunch-security.mjs
node scripts/test-insight-containment.mjs
python -m unittest discover -s ops/city-response/tests -v
npx tsc --noEmit -p tsconfig.app.json
npm run build
git diff --check
```

The final consolidated result is recorded in `verification.json`. Existing repository-wide lint debt is not represented as fixed. The root auth changes pass focused lint with the existing mixed component/hook fast-refresh warning.

PostgreSQL tests execute actual candidate SQL, RLS, privileges, triggers and transaction rollback using pinned PGlite. Selected historical baseline DDL, managed Auth helpers and complete source-lineage checks have explicit fixture boundaries. Single-connection tests do not prove separate-session contention. Provider stubs do not prove live or Stripe sandbox delivery. See the independent review for bugs found and corrected before preservation.

## Release sequence and stop conditions

1. Prepare an isolated staging database from a current, restorable native schema/data snapshot with appropriate private-data controls. Verify historical identities and affected constraints; run database advisors. No staging service was provisioned by this branch.
2. Apply the three candidate migrations in filename order: workspace isolation, atomic billing, then CRM workflow. Any precondition/constraint failure is a stop requiring review, never a reason to delete conflicting history.
3. Configure private scheduler credentials and deploy worker handler guards with their gateway configuration together. Rotate the formerly embedded digest credential through the secret manager. Keep SMS, tracing, drip, source delivery and checkout holds enabled.
4. Review the per-account backfill report. Provision only unambiguous ordinary customers using explicit review references; map historical shared business rows individually. Never mass-reassign staff/customer records or restore shared customer visibility to fix an error.
5. Complete two-account security, signed provider webhook, delayed/failed-payment, account closure and CRM acceptance. Resolve billing IDs with canonical account/mode/invoice evidence. Do not infer canceled status from a missing ID.
6. Obtain and verify the original market archive and all exceptions, then complete reviewed source acceptance. Preserve case-status distinctions.
7. Run the documented five-buyer pilot only with approved recipients. Record observed task completion and the 3–7-day return visit. Paid acquisition remains closed until these gates and buyer evidence support release.

The private workspace and billing migrations are additive but intentionally restrictive. Reverting to shared customer access or the old nontransactional webhook is unsafe. Preserve receipts, organizations, private CRM and source holds while repairing a failed deployment. Deployment and release are separate decisions; this draft must not automatically publish from `main`.

## Workstream evidence

- [Customer isolation](tenancy-status.md)
- [Privileged endpoints and support](security-status.md)
- [Billing](billing-status.md) and [sanitized reconciliation](billing-reconciliation-20260924.json)
- [CRM](crm-status.md)
- [Market validation](market-validation.md)
- [Public product experience](frontend-status.md)
- [Analytics privacy](analytics-privacy.md)
- [Independent review](review-status.md)
- [Pilot runbook](pilot/runbook.md) and [unobserved scorecard](pilot/scorecard.json)

## Root authentication repair

Role lookup is deferred outside Supabase's auth callback, bounded by a timeout, and fails closed. Stale responses are discarded after identity switches and sign-out. Browser role caches and stale checkout flags are removed; React Query data and in-flight private results are cleared before changing identity. A paid/trial subscription no longer bypasses a route's required role. Server policies remain authoritative. Client-side invitation role insertion was removed pending a server-verified membership workflow. Signup with email confirmation returns a successful signup and verification instructions instead of an erroneous automatic login attempt.

Seven behavioral tests cover revoked roles, timeout/failure, deferred lookup, late responses, sign-out and an actual late QueryClient result. They do not replace hosted authentication acceptance.
