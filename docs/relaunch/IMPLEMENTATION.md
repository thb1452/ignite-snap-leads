# Snap Ignite relaunch repairs — 2026-09-24

**Release state: HOLD. Candidate implementation and verification are not a production deployment or paid relaunch.**

Base: `16c1397507026d1eb03bebec7c7aec08d45ec2ee`. Branch: `codex/snap-relaunch-hardening-20260924`. Public review: [PR 193](https://github.com/thb1452/ignite-snap-leads/pull/193).

This public report contains implementation status, reproducible checks and outstanding gates. Private infrastructure references, account evidence, source records and recruitment details are retained outside this repository. It does not authorize copying private originals into a public or staging environment.

No production records, balances, source acceptances, provider sends, outreach or advertising were changed by this work. No Lovable generation prompt or new staging provision was initiated. Any future credit spending requires the owner's permission; no claim is made that existing Cloud usage is free.

## Execution status

| Requested step | Implemented or verified | Still required |
| --- | --- | --- |
| Customer separation and privileged access | Private workspace signup, legacy quarantine, reviewed provisioning, relationship constraints, privileged endpoint guards, cache clearing and explicit role checks. | Restorable isolated staging baseline, hosted migration, reviewed account mapping, real two-account Auth/PostgREST/browser checks and scheduler secret rotation. |
| Billing and payment-to-delivery | Atomic receipts and purchased credits, canonical paid-plan proof, duplicate/reordered-event handling, truthful checkout verification, cancellation-first closure and mode guards. | Private account/mode reconciliation, signed sandbox journeys, retention/erasure review and useful approved delivery. |
| One market | Original file, receipt and manifest hashes matched. Independent source reconstruction and agent review of the required sample and exceptions completed without import drift. | Remaining archive observation verification, coverage discrepancy resolution, source acceptance and customer authorization journey. Market remains unapproved. |
| Existing CRM | Private daily pipeline, contacts, action/deal editor, atomic manual outcomes, reload-safe exact-command retry, archive/restore, mobile handoff and private export. | Hosted migration, signed-in desktop/mobile acceptance, browser recovery lifecycle and actual reviewed-source receipt tests. |
| Public promises and buyer pilot | Claims aligned with holds; public desktop visuals, FAQ keyboard behavior and availability routing passed. Pilot runbook and synthetic rehearsal scope prepared. | Approved participants, product/market gates and actual moderated plus 3–7-day return-use sessions. No buyer results or outreach are claimed. |

Cloud sign-ins and the public preview are accessible. The preview is not isolated hosted staging; successful public presentation checks do not establish hosted migration, customer authentication or private CRM acceptance.

## Verification and reproduction

```sh
node --test tests/*.test.mjs tests/billing/*.test.mjs
node scripts/test-relaunch-security.mjs
node scripts/test-insight-containment.mjs
python -m unittest discover -s ops/city-response/tests -v
npx tsc --noEmit -p tsconfig.app.json
npm run build
git diff --check
```

The consolidated result is in [verification.json](verification.json): 93 Node results plus six reconciliation results, 52 Python tests, 184 security assertions and 213 containment assertions, app typechecking and production build passed. Existing repository-wide lint debt is not represented as fixed.

Pinned PGlite exercises actual candidate SQL, RLS, privileges, triggers and rollback within explicitly bounded schema/Auth/source fixtures. [Native PostgreSQL CI](staging-verification.md) additionally passed seven concurrency scenarios across three independent sessions at commit `bbfd18be090983a78207532d668984823cc76abc`; its public run and artifact are preserved. Later SQL or harness changes require fresh matching verification. These results do not certify a hosted Supabase deployment.

An approved blank Stripe sandbox is available and genuine signed provider events have exercised the candidate handler and billing SQL. The provider sequence exposed a paid-proration proof bug; the correction passed 32 targeted regressions and the complete 13-check isolated provider suite. See [sandbox verification](stripe-sandbox-tests.md) for the current provider execution results and exact remaining limits. These results do not establish hosted payment-to-delivery. Real local Supabase Auth, PostgREST and function-gateway checks also passed nine synthetic scenarios; the [separate receipt](local-supabase-ci.md) preserves that scope.

CRM tests replay the exact saved command after a committed outcome loses its acknowledgement, producing one activity. Recovery is scoped to actor and lead, uses per-tab sessionStorage, preserves the original 24-hour expiry and removes private text after expiry while retaining a blocking receipt pointer. Only validated same-actor initial hydration may preserve it; account switches, sign-out and permission failures purge it. Stale callbacks cannot erase another actor's pending attempt. Hosted browser reload/token-refresh/account-switch behavior remains a release check.

## Remaining release gates

1. Establish and verify an isolated hosted baseline and restorable backup. Preserve private data boundaries; a preview or schema inventory is not a restore test.
2. Apply the exact migrations and coordinated function/configuration bundle in [deployment-runbook.md](deployment-runbook.md). Stop on any constraint/precondition failure; never delete history or weaken RLS to continue.
3. Review private account mapping and canonical billing provenance before any exact-row correction. Missing provider identities do not establish cancellation, and historical test events do not prove current provider state.
4. Complete hosted two-account security, signed payment events, delayed/failed payment, account closure, CRM and source-preservation acceptance. Keep provider, source and checkout holds enabled.
5. Finish the remaining archived-observation verification and scoped source acceptance. The period interpretation is resolved only for an exact partial dated snapshot; recurring refresh remains unverified. Independent source inspection passed; that does not by itself approve a customer market.
6. Send the already approved single qualification invitation after the email connection returns a verified sender, then observe real buyer tasks and return use. No send call has occurred. Other recipient ambiguities remain unresolved. Synthetic rehearsal cannot substitute for the pilot. Paid acquisition remains closed.

## Evidence

- [Customer isolation](tenancy-status.md) and [privileged endpoints/support](security-status.md)
- [Billing implementation](billing-status.md), [reconciliation process](billing-canonical-reconciliation.md) and [sandbox verification](stripe-sandbox-tests.md)
- [CRM implementation](crm-status.md) and [native staging verification](staging-verification.md)
- [Market validation process](market-validation.md)
- [Public product experience](frontend-status.md) and [analytics privacy](analytics-privacy.md)
- [Independent review](review-status.md)
- [Pilot runbook](pilot/runbook.md), [recruitment readiness](pilot/recruitment-readiness.md), [internal rehearsal](pilot/internal-rehearsal.md) and [unobserved scorecard](pilot/scorecard.json)
