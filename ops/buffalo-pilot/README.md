# Buffalo first residential Code pilot

The October 20 pilot is imported into Snap's private owner review, preserving 984 separate government violation IDs. It is not published into the general customer lead inventory. The existing upload hold, Syracuse review/acceptance flow, and Madison Heights receipt flow remain unchanged.

## What was imported

- 984 eligible violations across 322 agency cases, 307 complete addresses and 376 source parcel references.
- Four possible duplicate rows remain held: 538939, 538938, 539418 and 539421.
- Agency violation dates are September 21–October 5, 2026. Source collection finished October 19, 2026 at 23:43:46 UTC.
- Source: https://data.buffalony.gov/resource/ivrf-k9vm.json
- Residential classification follows retained NYS property-class evidence. This is not an ownership/contact enrichment or current-condition guarantee.
- A shared address does not establish a single property; source parcel references remain separate.

## Import and review

The existing Snap session opens `/owner/source-review`. The Buffalo panel calls only `fn_owner_buffalo_source_review_v1`, displays 25 source violations per page, and renders source dates as calendar dates without inventing case-open dates, ages or scores. Only the verified owner allowlisted for this exact batch can read it. Review does not invoke customer publication, CRM, email, payments or fee approval.

The importer is private, SECURITY INVOKER, and unavailable to API roles. The owner RPC is authenticated, with explicit batch access and account validity checks. Source evidence is immutable. The manifest, each raw/cleaned record, and the complete record sequence are SHA-256 verified. Identical replays return the original receipt; changed payloads or source IDs are rejected for review.

## Reproducing the proof

Use the retained `Buffalo_Pilot_2026-10-20` preparation directory; do not redownload the agency data. No raw records or credentials are committed to this repository.

```sh
python3 ops/buffalo-pilot/runtime/build_import.py <prepared-directory> <private-output-directory>
python3 -m unittest discover -s ops/buffalo-pilot/runtime -p 'test*.py'
node --experimental-strip-types --test tests/buffalo-source-review.test.mjs tests/source-review.test.mjs
npx tsc --project tsconfig.app.json --noEmit
npx eslint src/services/buffaloSourceReview.ts src/components/source-review/BuffaloSourceReview.tsx src/pages/OwnerSourceReview.tsx
npm run build
```

`sql/import-review.sql` is an intentionally non-repeatable schema installation. It does not itself import records or grant owner access. For a fresh isolated test, use its BEGIN but remove its final COMMIT, call the private importer with the complete hash-verified payload, run `sql/verify-pilot.sql`, and ROLLBACK. Never append a rollback after an already committed installation.

`sql/transport.sql` is a temporary admin-only workaround for SQL request size limits: 31 ordered text chunks are reconstructed and verified before the unchanged importer is called. It does not import partial records or expose a new API. Remove that table only after successful import and saved-evidence readback; the batch retains the complete original envelope.

The verifier checks exact saved hashes/counts, replay with zero added rows, altered-payload rejection, source immutability, owner and unassigned reads, revocation, API role restrictions and RLS. Its role claims are transaction-local test simulations, not real sign-in sessions. Run it inside a transaction that will be rolled back.

## Release boundary

This pilot proves private ingestion and owner review only. Main customer lead browsing still uses the legacy property/violation model. Customer release needs an explicit reviewed mapping/acceptance extension that preserves source parcel and event identities. Do not enable the general uploader, overwrite legacy case rows, bypass the source/account fences, or expand this pinned pilot to other cities.

See `proof-20261020.json` for actual database evidence and remaining deployment/session verification.
