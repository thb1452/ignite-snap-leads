# Independent release review

Reviewed the local repair branch against `16c1397507026d1eb03bebec7c7aec08d45ec2ee` on 2026-09-24. This is a source and isolated-runtime review, not production deployment acceptance.

## Findings resolved during review

| Finding | Resolution and evidence |
| --- | --- |
| Tenancy migration referenced the obsolete `public.contacts` table. Its fixture retained a table dropped by the real migration history. | Reproduced PostgreSQL `42P01` after removing that table from the fixture. The owner independently confirmed its absence in the native catalog, removed the reference, and corrected the fixture. |
| New CRM action/date consistency constraint rejected legacy leads that already had a follow-up date. | Migration now assigns the neutral `Review saved follow-up` action without clearing the existing date. A PostgreSQL fixture preserves the date and permits a subsequent stage update. |
| A valid 1,001–4,000 character do-not-contact outcome rolled back when copied into the 1,000-character contact restriction field. | Full note stays in private activity; only the restriction summary is bounded. The fixture exercises a 1,500-character note. |
| An unpaid plan change could inherit the old paid-through date and activate the new plan. | Current-price paid-invoice evidence is required for an active plan change. The unpaid upgrade fixture preserves the old plan and leaves the failed event retryable. |
| Existing privileged source handoff could write a quarantined customer's CRM lead into the shared organization. | The common CRM relationship trigger checks workspace readiness whenever a caller subject exists, including inside security-definer code. Source receipt validation remains unchanged. |
| Lead editor retained an obsolete version after an outcome or stage change, leaving Save in a permanent conflict. | The editor exposes an explicit latest-values reload and prevents saving the stale draft. Outcome retries retain the exact original command after an uncertain response. These React interactions still require browser verification. |
| A lower-ticket Stripe fetch could observe a later cancellation and have it discarded as stale. | Terminal cancellation is now accepted regardless of ticket order and cannot be resurrected by a later active snapshot for the same subscription ID. A reversed-ticket PostgreSQL fixture covers both directions. |

## Independent verification performed

- Auth boundary plus tenancy: 23 passing Node results at the first review checkpoint.
- Market verifier: 9 passing Python cases. It never authorizes customer release; a fully evidenced result only requests owner review.
- Billing/provider/CRM checkpoint: 34 passing Node results, including atomic rollback, unpaid-plan handling, replay behavior, failed webhook persistence, private contacts and source-safe export.
- Revised tenancy plus CRM checkpoint: 28 passing Node results, including legacy date preservation and property cleanup protection for legacy notes, saved-list links and purchased unlocks.
- Final billing atomic check: 15 passing Node results, including the reversed-ticket terminal cancellation and unpaid upgrade regressions.
- Integrated release fixture: all three candidates apply in filename order and perform actual billing and CRM operations in one isolated PostgreSQL database. Subscription tables use the checked-in native column/default/constraint/index/policy snapshot; transaction, affiliate, ledger and webhook DDL come from repository migration sections. The ledger includes generated metadata columns, the global session identity index, its read-only customer policy and its debit immutability trigger. The passing fixture verifies retained legacy follow-up dates, service-only replay-safe payment accounting, one affiliate receipt, private contacts and manual outcomes, cancellation without private-work loss, and payment that cannot bypass source or checkout holds.

Counts are checkpoints while the branch was being polished. The final implementation report should use the final consolidated run.

Run the integrated fixture with `node --test tests/integrated-relaunch.test.mjs`.

## Remaining acceptance boundaries

- A fetch ticket allocated before a Stripe request does not prove the order in which separate requests reached Stripe. Terminal cancellation has an explicit safeguard; nonterminal overlapping provider reads remain a staging concurrency case.
- PostgreSQL tests execute real RLS, privileges, triggers, constraints and transactions, but the baseline loads selected migration DDL. Managed Auth functions and the complete source-lineage validator have labeled fixture substitutes. These tests cannot certify that every hosted baseline object, grant, extension or historical row matches the fixture.
- PGlite uses one connection. Promises submitted together exercise replay logic, not genuinely parallel PostgreSQL sessions or a distributed provider race.
- Hosted Auth, PostgREST, realtime, deployment migration replay, signed-in cross-account browser checks and actual payment-to-delivery behavior remain staging gates.
- The original municipal source archive and the reviewed exception ledger were unavailable. Automated comparison and a sampling plan do not replace original-record review or a buyer pilot.
- Source, provider and checkout release holds must remain enabled until their separate acceptance evidence is complete. No production write, paid provider request, live message or Lovable generation was performed by this review.
