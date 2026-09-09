# Municipal source review boundary

Source-specific adapters run before canonical ingestion. Do not treat shared field names as shared meanings. A new municipal source needs a reviewed, versioned mapping of its record grain, identifiers, dates, types, statuses, locations and uncertainty. Keep the original file and unmodified source attributes alongside the mapping.

The first adapters support Syracuse Code Violations V2 and Chicago 22u3-xenr. Case, inspection, violation and property references remain distinct. Source modification is never a substitute for violation opening. Chicago civil timestamps remain offset-free; Syracuse epoch values retain their raw values and explicit UTC representation. Unknown statuses and categories stay unmapped. Source status at collection does not establish current property conditions.

## Release components

- `20260909132816_d8d8ca82-436c-40b5-b21f-6ef659a44ee4.sql`: canonical migration recorded by the native database as version `20260909132816`, name `d8d8ca82-436c-40b5-b21f-6ef659a44ee4`. It adds nullable source evidence, immutable operator bindings, service-authored semantics, and the transactional review RPC. Existing account roles and owner access policies remain unchanged.
- [Reviewed SQL reference](source-semantic-reference/reviewed/20260909080000_source_semantic_staging.sql): preserved original bytes. This is identical to the canonical installed SQL apart from one final newline, and is outside automatic migrations to prevent duplicate schema creation.
- [Pending JSON storage reference](source-semantic-reference/pending-operator/20260909132000_source_review_json_storage.sql): preserved, unapplied SQL. The platform rejected the storage-bucket write before execution. This file is outside automatic migrations and is not an instruction to retry or bypass that restriction.
- `process-upload`: a verified binding routes an exact, hash-matched original to pending review before any legacy parsing, property import, geocoding or insight work.
- `generate-insights` and `snap-mcp-proxy`: do not score held source namespaces using unsupported common meanings or invented opening dates.
- Upload details: every owned row can be paged and its source meaning inspected. Completion means staging finished; it is not acceptance or distribution.

## Operator sequence

The native schema migration is already recorded under version `20260909132816`; do not reapply the reviewed predecessor or change migration history. Its September 9, 2026 13:31:04 UTC native checkpoint showed zero source bindings, binding RLS enabled and service-role-only binding reads. This checkpoint does not establish later function deployment or source processing.

Complete and verify the matching function import graphs and frontend release through the existing deployment process, preserving JWT settings. Deploy the two scoring guards before activating the matching upload handler. This repository cleanup does not deploy functions or change native state.

The September 9 compatibility release deployed those three functions in that order, and the provider's 13:31:19 UTC OPTIONS checks returned the expected release marker. The published upload page was separately verified with the existing owner session: two pages of an existing 510-row historical upload loaded and displayed the unverified legacy-meaning notice. No rich-original upload or customer acceptance was performed. Older access-rule findings surfaced during publication remain a separate repair requirement before customer relaunch.

**Rich JSON ingestion remains on hold.** The private `csv-uploads` bucket still permits only `text/csv` and `application/vnd.ms-excel`, with its existing 50 MiB limit. The rejected JSON storage change has not added `application/json`. A supported, authorized storage configuration change and the complete verified release are prerequisites before the setup below. Do not relabel JSON as CSV or use this cleanup to retry the rejected SQL.

After those prerequisites are met, create a private original object and an owner-scoped upload job without starting processing. The existing `createUploadJob` helper automatically invokes processing and therefore must not be used for this setup. Record the exact job owner, approved source key, acquisition ID, collection time and original SHA-256 in the operator binding. Then explicitly invoke the existing authenticated upload handler. Never accept a source binding from an uploaded file, filename or request body.

Reconcile every original row and identifier after staging. Require zero customer property/violation writes, no paid or AI enrichment calls, and pending review with no acceptance. A lost response is ambiguous: inspect authoritative database state and replay the same bound original. Do not delete staging or replace the original to force a retry.

New mappings, parcel matches, current-condition claims, common categories, customer acceptance and distribution remain separate review decisions. Water records require their own adapters and verification before entering this path.

## Evidence and recovery

The release passed original Syracuse/Chicago fixture checks, isolated owner pagination/session checks, full application type checking and production build. A native PostgreSQL rehearsal exercised role isolation, exact replay and refusal of forged semantics, then rolled back all synthetic jobs and schema additions. Existing access boundaries were compared after rollback. These checks are not proof of live deployment or real customer acceptance.

The matching function sources define bodyless OPTIONS responses with `X-Snap-Release: snap-customer-source-semantic-20260909-v2`. Verify the actual response and pair it with the provider deployment receipt and independently pinned repository files. The marker is not cryptographic attestation of a deployed bundle.

After retaining real source evidence, hold new source invocations and correct forward if necessary. Do not drop source evidence columns/tables, delete originals, or downgrade to a JSON-unaware upload handler. Outbound requests, record fees, tracing, SMS and publication acceptance are not enabled by this release.
