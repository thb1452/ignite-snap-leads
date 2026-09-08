# Customer acceptance and export boundary

This change adds a server-only, unused contract for moving reviewed collections toward customer delivery. It does not accept records, restore the customer service, import data, change authentication, install database objects, or alter the live export endpoint.

Implementation: `supabase/functions/_shared/customer-delivery-contract.ts`. Tests: `tests/customer-delivery-contract.test.ts`.

## Evidence checked on September 7, 2026

- PR #172 was pinned at `1b599e5a4e9cd7c46d99c142c9a66175c9c74737` before these three new files were added. Existing owner dashboard changes were preserved.
- The current customer client uses its configured Vite project or the fallback `ojyxblegxpdgaqiscxpz`. One connector check of that project returned a permission error; one health URL check failed DNS. Its live schema and authorization could not be verified. Reconnection or a scoped repair remains separate work; a replacement project would need an explicit migration review.
- The reachable worker project is `dqwolscmceelqpkfclgi`. Its owner dashboard has a separate client and owner-only endpoint. The inspected worker `properties` table has an authenticated SELECT policy based on `auth.uid() IS NOT NULL`; it is not a substitute for customer entitlements. No client was pointed at that project and no role was broadened.
- Existing customer reads use `fn_properties_paged`, related RPCs and direct property queries. `export-csv` checks the customer JWT, subscription/trial/credits/unlocks and reads canonical properties, including `fn_export_properties_batch`. Neither path currently consults the new private collection register.
- The legacy CSV uploader inserts properties/violations directly, defaults missing status to `Open`, and starts insight/geocoding work. It must not receive staged candidates as the new release path.
- Private collection deliveries/processing runs retain `customer_accepted=false` and `usable_records=false` constraints. Their evidence is immutable. Acceptance needs a separate append-only release store; changing these flags is not an integration shortcut.
- Current staging is `delivery-stage-v1.1`: code-violation candidates only, including source-file hash, source row, record key, canonical fields and warnings. Water records remain held as unsupported. Syracuse has 1,074 candidate rows with confidentiality-not-provided warnings, not 1,074 accepted customer records. Its original copies are recorded as local, and independent private-cloud preservation is unverified.

## Implemented contract

`prepareCustomerRelease(collection, exactCandidateJsonlBytes, selection)` validates a concrete proposed subset. It checks the exact candidate-file SHA-256 and declared row accounting, rejects held/duplicate/misbound rows, and binds every selected row to its canonical hash and an explicit customer property ID/revision. Property matching retains the unit, city, state and jurisdiction. Separate violations in the same case remain separate records. It never guesses an address match, supplies a missing status, drops uncertain rows silently, or creates a property.

Every selected row needs a distribution-clearance disposition and the exact warning list acknowledged. This is an explicit review input; acknowledging a warning is not itself evidence of permission to distribute. The final review must cover the complete projected text, confidentiality, missing fields, dates, duplicates, location, property mapping and distribution rights.

The result has a deterministic digest over the destination, source metadata, exact selection, property revisions and fixed customer projection. Selection order does not change that digest. Any edit requires a new review. Raw originals, mailbox addresses, local paths, arbitrary original columns, requester credentials and review identities are omitted from customer rows. Original description, source status, normalized status, case/violation IDs, unit, source citation, source row and collection date remain intact. Historical records carry their historical label.

`prepareAcceptanceCommit(proposal, storedDecision, originalVerification, now)` produces only a `prepared_for_commit` plan. It requires a current approval of that exact digest with every review check complete, plus a matching private-original artifact verification made within the prior 24 hours. Local-only storage, unverified receipts, stale verification and future collection dates block this step. The verification must come from an actual server read/hash of the private object; setting `storage_kind` in JSON is not proof of preservation. Nothing in this function writes an acceptance receipt.

The current destination is explicitly bound to `ojyxblegxpdgaqiscxpz` in the collection, property mappings and server export adapter. Worker-project mappings are rejected. This is a destination check, not proof that the old customer project is available. A future destination change must update and review that binding with the actual customer schema and access rules.

`buildCustomerExport(authenticatedCustomerId, request, authority, clock)` loads a committed accepted release through a trusted server adapter, verifies its exact digest and current review, and selects only properties present in that release. It obtains a transaction-backed grant for the exact customer, release, property IDs and record keys before returning bytes. The grant separates distinct property usage from violation-row counts. Expired/revoked/wrong-customer/wrong-subset grants fail closed. A review or grant expiring during the asynchronous reservation is checked again.

The export request UUID identifies one operation. Retries reuse it and their reservation; a new operation uses a new UUID. Reusing one UUID with a different subset must conflict in the adapter. A fixed CSV projection quotes every field and neutralizes spreadsheet formulas after whitespace or invisible padding. An export manifest records the release hash, CSV hash, counts and freshness. This richer case-level export is a new format, not a silent replacement for the existing nine-column property summary.

Bounds are explicit: at most 50,000 input/selected records per staged release, 32 MiB candidate artifact, 64 MiB CSV. Larger collections require a reviewed chunking contract, not truncation. Code violations are supported; water release remains blocked until a tested water-specific schema and review path exist.

## Integration seam still to implement and verify

The module's decisions, original verifications, committed receipts and grants are trusted server inputs. They are not authentication tokens or cryptographic signatures. Do not expose a route that takes them from request JSON. Only the release ID, property selection and export request UUID belong in customer input; the customer ID comes from the existing verified customer JWT.

The future acceptance writer must run a database transaction that:

1. Locks the exact source delivery, processing run, artifact hashes, property revisions and stored review decision; reconstructs the proposal from the verified candidate bytes; and reruns the commit checks under that lock.
2. Checks the private original still exists and matches its stored content hash. Records only the verification reference in the release receipt; storage paths and signed URLs stay private.
3. Inserts an immutable release, selected record-to-property mappings and approval evidence with uniqueness on the release idempotency key/content digest. Replays return the same committed receipt; changed scope conflicts; a revoked release cannot be resurrected by replay.
4. Commits the receipt and its selected mappings together. Interrupted/failed transactions leave no visible release. Existing candidate/review evidence stays unchanged; no trigger may submit requests, send correspondence, publish stories or start unreviewed enrichment.

The future customer adapter must implement `CustomerExportAuthority`. `loadAcceptedRelease` reads that accepted store. `reserveExport` must atomically recheck the live release/review/revocation and property revisions, verify the existing customer subscription/data tier/unlocks, and reserve the correct trial/PAYG/monthly usage. Its database must enforce uniqueness of `(customer_id, export_request_id)` and compare the stored scope digest on replay. Concurrent requests cannot both spend the same remaining credit. A returned grant is the authorization point for that bounded download; subsequent revocation blocks future grants. Failed or abandoned grants need a documented usage-reconciliation policy. The pure module does not manufacture quota balances or perform payment operations.

The actual customer query/export routes must then read only committed selected mappings, including list/map/category/direct-property paths. Raw candidate rows must not be inserted into the broadly read legacy property table. Preserve the existing customer JWT and subscription rules, and keep the owner client/service credentials out of browser code. New narrow server adapters and their database grants/RLS need real PostgreSQL concurrency, rollback and cross-customer tests before activation. A service role alone is not customer authorization.

There is no adapter, release table migration, customer import, caller-facing change or deployment in this change. The contract is deliberately not imported by any existing endpoint. It leaves current accepted and usable-record counts unchanged.

## Validation

Run from the repository with Node 24:

```sh
node --experimental-strip-types --test tests/customer-delivery-contract.test.ts
./node_modules/.bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --allowImportingTsExtensions --lib ES2023,DOM --types node --skipLibCheck supabase/functions/_shared/customer-delivery-contract.ts tests/customer-delivery-contract.test.ts
./node_modules/.bin/eslint supabase/functions/_shared/customer-delivery-contract.ts tests/customer-delivery-contract.test.ts
```

Tests use synthetic records and a fake authorization/reservation adapter. They cover exact artifact and review binding, incomplete warnings, row accounting, separate case violations and units, destination isolation, durability, revocation/expiry, changed export scope, quota denial, property-versus-record counts, CSV formula protection and private-field exclusion. They are not production authorization or PostgreSQL integration tests. No real customer data or provider requests are used.
