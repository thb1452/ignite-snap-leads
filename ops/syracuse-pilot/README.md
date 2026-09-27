# Syracuse source-to-investor pilot

This path collects and cleans source data without a customer login. Reviewed source rules remove private contact fields and prevent raw narrative fallbacks. Customer access and export are separate, explicit decisions. No City outreach is part of collection or cleaning.

## Current release state — September 27, 2026

Private intake, native violation identities and immutable source/destination receipt linking are installed. The most recent live check found 27 observations of 9 distinct violations across three captures, three property mappings, one review and zero customer acceptances. Private reviewer grants are limited and expire; account-specific executed SQL is retained outside this public repository.

The customer catalog, detail screen, clean export, ordinary-consumer access check and repeated-capture mapping fix are candidates. They are not deployed. The live timer started collection on September 27 at 07:23:50 UTC; the service exited successfully at 07:24:12 and both systems hold the same resulting receipt. Backend counts and synthetic tests do not establish customer delivery.

## Data contract

The bounded selection covers three Syracuse parcel identities and preserves all separate violation IDs within each case/property. A repeated observation is not a new violation. A missing row does not establish closure. Source rows outside this pilot are reconciled separately and are not accepted for customer use.

Only the supported exact code labels, source statuses, native identifiers, dates and verified property facts pass the clean boundary. Unknown labels, appended narratives, contact fields and invalid identity/date bindings fail closed. Original source responses remain private evidence. Every clean event retains source URL, delivery/run, row and content hashes. The importer recomputes source, description, identity and revision bindings rather than trusting the worker.

`runtime/clean_syracuse.py` implements the adapter; `runtime/syracuse_worker.py` builds a bounded handoff; `runtime/intake_handoff.py` saves exact retry bytes and links the destination receipt back to operations. Replay conflicts are rejected and successful retries do not duplicate receipts.

## First investor output

An authorized customer can search and open the matched property, see each documented case and native violation ID, exact code label, case-opening date, citation date, status as collected, status-change date and compliance date where supplied. Case opening is not a separately verified violation opening. Facts and conditional implications cite their source evidence and collection time.

The supported indicator is documented open-violation count. Investment score, market value, repair costs, owner intent and private contacts are unavailable. The property screen keeps authorized observations over time and separately counts the latest distinct violations. The selected citation window is incomplete history; unobserved status transitions remain unavailable. The 48-hour collection freshness target is a product policy and does not establish when the City last updated its source. Parcel evidence dates remain explicit.

The analysis and CSV serializers require the strict cleaned contract. They cannot fall back to raw narratives. Export groups all violations by authorized property, retains existing property-based billing and quota checks, and replays the saved receipt without a second debit.

## Source-level distribution review

The official dataset links to the [Syracuse terms](https://data.syr.gov/pages/termsofuse) and [open-data policy](https://data.syr.gov/pages/open-data-policy). Preserve exact reproduced labels, source attribution, access/publication dates and source notices; label analysis separately. The dataset publication date is November 13, 2024, not the publication date of an individual violation. Private contacts are excluded. Source distribution review is separate from automated cleaning; no source decision may be marked verified without supporting evidence.

## Candidate installation

`intake-native-id.sql`, `cleaned-source-boundary.sql`, `private-worker-entry.sql` and `operations-receipts.sql` describe the private intake changes already installed. Do not blindly reapply them. Compare live function definitions and preserve their current access controls before any rollout.

Customer candidates are `ordinary-accepted-consumer.candidate.sql`, `customer-clean-catalog.candidate.sql`, `customer-clean-export.candidate.sql` and `repeat-property-mapping.candidate.sql`. The ordinary consumer change retains exact account/org, expiry, review, accepting authority, mapping and revocation checks. It removes only the unrelated administrator requirement for an already accepted consumer.

The mapping candidate reuses parcel evidence only when every fact, source hash, retrieval timestamp and limitation matches; only the batch identifier may differ. Changed evidence needs a new reviewed mapping. The review UI receives the current batch evidence hash while retaining the original mapping hash. Revocations invalidate pagination without exposing another batch's review notes.

## Verification and rollback

Portable boundary tests: `python3 -m unittest discover -s ops/syracuse-pilot/tests -v`. Clean customer output, status history and CSV regression: `node --experimental-strip-types tests/clean-syracuse.test.ts` (Node 24). Application type checking: `npx tsc -p tsconfig.app.json --noEmit`.

The isolated database regression uses two real captured inputs and synthetic accounts. It verifies nine latest violations, eighteen observations, three reused mappings, unauthorized-account rejection, revocation, receipt replay, one export debit and rollback. Real capture files, account-specific grants and the test's private deployment fixture stay outside Git. Fifteen Python tests, eleven database test groups, TypeScript checking and production build passed. Madison privacy checks are regression evidence only. These tests are not a 10,000-file throughput benchmark.

Rollback preserves originals, saved outboxes, observations and receipts. Disable the private handoff policy first; restore the pinned collector/service configuration only after checking for newer changes. Do not drop evidence tables. The live handoff kill switch and exact-byte retry have been exercised; complete host restoration remains to be verified.

Phase 3 remains open until fresh normal-trigger collection, cleaned acceptance, real signed-in customer search/detail/cited insights/export, negative-account behavior, second accepted collection and rollback are all proved in the deployed system.
