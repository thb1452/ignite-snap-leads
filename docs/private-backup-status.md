# Owner private-backup status

The Data quality view now includes **Private backups**. This is read-only monitoring of actual registered file-verification evidence, separate from source collection counts, candidate rows, customer acceptance and editorial publication.

The existing owner endpoint keeps its verified Auth session, confirmed email and server-owned allowlist checks. Three fixed bounded reads are added:

- `archivePlans`: plan ID, delivery ID, artifact count and registration time; maximum 1,000 rows.
- `archiveVerifications`: verification ID, plan ID, delivery ID, actual verification time, artifact count and registration time; maximum 1,000 rows.
- `archiveCopies`: private-copy artifact ID, delivery ID and storage kind, restricted to `supabase_private`; maximum 2,000 rows.

No plan/proof JSON, hashes, object references, local paths, file contents, backend keys or signed URLs are selected or returned. Original-location metadata remains separate and distinguishes local files from recorded private copies.

The panel chooses the newest saved plan for each displayed collection and its newest verification. It checks matching delivery/plan IDs, artifact counts, private-copy location counts and dates before labeling it verified. Repeated proof events, multiple artifacts and repeated delivery rows never increase the collection count. A newer pending plan cannot inherit an older plan's success. A private location alone is insufficient.

“Collections verified in 24 hours” counts recent checks only. Older checks remain visible as **Recheck due**, with their actual dates. Dashboard refresh never renews those dates or performs a hash check. Missing, failed or truncated feeds make totals unavailable; inconsistent counts and invalid/future dates require review. The current bounded implementation does not infer an organization-wide total from incomplete lists. It intentionally shows unavailable totals once any required feed is truncated, until a future server-side aggregate or pagination step supplies full coverage.

This view trusts the private backend append transaction to establish actual downloaded-byte verification. It is not a substitute for that verifier and performs no archive/upload/approval action. The latest plan covers its pinned archive; later unplanned artifacts are not asserted to be backed up. Customer acceptance and publication remain unchanged.

Verification age updates independently of network refresh, including at the 24-hour boundary and when the tab regains focus. Pausing automatic refresh does not freeze a recent-verification badge. Distinct plans with the same newest registration timestamp are ambiguous and cannot be selected by UUID order.

Validation: nine focused summary tests plus twenty owner API tests pass. All 30 isolated owner browser tests pass, including six new checks for verified/repeated proofs, stale checks after refresh, expiry with automatic refresh paused, pending plans, failed feeds and truncation. App and handler TypeScript checks, scoped lint and production build pass. Desktop and mobile screenshots were inspected. Browser traffic uses synthetic fixtures on a separate local test port, without touching the owner’s active session.

Deployment remains a separate root-controlled step: preserve the exact reviewed files in draft PR #172; deploy the owner endpoint with existing Auth verification and secrets unchanged; verify its selected empty/real metadata feeds and unauthenticated 401; then update the owner preview assets and inspect the signed-in Data quality screen. No database migration is part of this UI change—the two private archive tables and their grants were installed separately. No endpoint/UI deployment, cloud upload, customer write or publication was performed by this implementation.
