# Recent backup jobs in the owner dashboard

The Data quality view now adds **Recent backup jobs** below the existing Private backups panel. It shows automatic Syracuse backup work and an explicit next action for each visible job. It is a read-only observation of the queue, not a worker launcher, approval control or new backup-verification path.

## Fixed owner-only reads

Existing Auth verification, confirmed-email owner allowlist, GET/OPTIONS methods and allowed origins remain unchanged. Access-only checks return before either new feed is read.

- `archiveJobs` reads `collection_archive_jobs`, restricted to `worker_name=archive_syracuse`, ordered by `updated_at DESC, id ASC`, with a 100-row bound and exact count metadata. Only `id`, `delivery_id`, `processing_run_id`, `state`, `attempt_count`, `next_attempt_at`, `lease_expires_at`, `verification_id`, `last_error_code`, `created_at` and `updated_at` are selected.
- `archiveControl` reads only `ops_control.key=harvester_syracuse_archive_enabled`. The endpoint converts exactly one boolean value into `{ enabled: true | false | null }`. Missing, duplicate or malformed control values become null. Arbitrary control JSON is never returned.

No intent, bundle/plan hash, lease token, storage path, object key, property payload, credential or raw exception text is selected. Error codes are displayed through a fixed plain-language mapping. Unknown state/error values, inconsistent lease/proof fields and invalid timestamps require review instead of being displayed as progress.

The candidate archive queue migration already grants backend service-role SELECT and revokes direct anonymous and ordinary authenticated access. Installing that migration and checking its real grants remain separate rollout steps. A missing queue table yields an unavailable feed, while existing source/proof/copy feeds continue to load.

## Meaning and limits

| Recorded evidence | Display and next action |
|---|---|
| Queued | Await the next permitted worker run; an enabled control does not prove a timer is running. |
| Unexpired lease | An attempt is recorded in progress. Show its expiry and used attempts; a lease alone does not prove a live process. |
| Expired lease | Recovery pending. The next permitted run can recover it or hold an exhausted fourth attempt. |
| Retry wait | Show the scheduled time, becoming Retry due when it passes. Do not claim another attempt began. |
| Held | Review the failed evidence or attempts. Automatic retries stopped; the job is not reset here. |
| Verified | A finished job needs its exact referenced proof ID, matching delivery, valid file count and actual verification time before displaying completion. Missing/mismatched evidence remains Completion needs verification. Checks older than 24 hours show Recheck due; a finished job does not refresh itself. |
| Paused/unknown control | Preserve recorded job state, but waiting instructions explain that the pause/configuration needs review before another attempt is expected. |

Lease, retry and proof-age boundaries update on their actual timestamps independently of network polling, including after focus or visibility changes. Refreshing the page never changes a recorded proof date.

The list shows recent **jobs**, not acquisitions or properties. Different jobs for one collection remain separate rows. No organization-wide pending-work total is inferred from this bounded list. Missing/truncated feeds cannot establish that jobs elsewhere are absent. Complete empty results say no automatic jobs are recorded and point out that older/manual backups may have separate proof evidence.

Existing plan/proof/copy reconciliation, collection counts, candidate counts, customer acceptance and publication remain unchanged. The new component has no action buttons and performs no network request of its own.

## Validation and deployment boundary

Focused checks cover the fixed projection/control filter, owner/access-only authorization, absent-table isolation, malformed control values, every queue state, retry/lease expiry, exhausted attempts, unknown errors, proof mismatch/staleness, duplicate IDs, and multiple jobs without changing backup totals. Browser checks cover all visible states, paused/unknown controls, unavailable/truncated feeds, unchanged collection/candidate/verification counts, the mobile layout and time boundaries with auto-refresh paused and no additional endpoint read.

Validation passed: 24 owner API tests, nine existing private-backup summary tests, 11 archive-job summary tests and all 36 isolated browser checks. Application and endpoint type checks, focused lint, production build and whitespace checks passed. Desktop and mobile captures were visually inspected. Browser fixtures are synthetic; these tests do not establish the live queue or timer state.

This source is prepared for independent review. No PR push, endpoint deployment, database migration, worker activation, live-preview change, customer write or publication was performed by this implementation task.
