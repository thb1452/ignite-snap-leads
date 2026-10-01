# Isolated staging receipt/case adapter

`01_receipt_case_adapter.sql` is an additive, staging-only extension of the existing eight-file `release-hosted` baseline. It is not a production migration. It imports no data and grants no source authority or customer acceptance on installation. No private record values, source hashes, account identifiers or credentials belong in this directory.

The adapter represents cleaned Madison Heights enforcement **cases**, with exact original/row/cleaning/version/selection hashes and source citations. It never creates `public.violations`, fabricates parcel enrichment or treats a case as an individual violation. Each immutable snapshot identifies its reviewed subset, held count, report date and evidence kind. Synthetic and original-backed lineage cannot share the same case/property identity. Recurring freshness is always unverified.

## Preconditions and application

Finish or pause other hosted acceptance work before applying. The root release operator owns hosted actions. Review the exact SQL and tests, capture its SHA-256, inspect the target marker and matching baseline definitions, and save a restorable staging checkpoint before application. Require the separately approved isolated target; never apply to production, Ops or a preview backed by production.

The SQL requires `current_user=postgres`, exactly one ready synthetic fixture marker, checkout held, the PT409 CRM workflow, exact body/owner/ACL/search-path fingerprints of the two replaced source predicates, the exact restrictive property policy, no preexisting receipt RPC names/overloads and empty legacy source fixtures. It fails on drift. It does not replay the baseline, alter managed Auth/realtime or change billing/legacy source/export holds.

For an already approved configured private SQL connection, the single additive operation is:

```sh
psql "$STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f scripts/tests/release-hosted-source/01_receipt_case_adapter.sql
```

This is an instruction, not an executed hosted action. The SQL does not retrieve credentials or call a remote API. The separate, explicitly invoked hosted proof runner below reads a private configuration and calls only the bound staging API. Do not rerun the adapter after success; reconcile the catalog/receipt instead.

## Private state and authority

All eight `snap_receipt` tables have RLS, no direct customer/service grants and UPDATE/DELETE/TRUNCATE rejection. Source/customer identity references use restrictive foreign keys. Public RPCs are authenticated-only; the two input/authority functions below are private SQL-only and reject callers other than `postgres`. Never expose that schema through PostgREST or grant HTTP users/service-role direct writes.

| State | Contract |
|---|---|
| `snapshots`, `records` | Immutable original-backed or synthetic cleaned subset and hashes; all rows must reconcile with declared counts. |
| `property_mappings` | Full agency + parcel + normalized full-address key; suite/address distinctions survive. New IDs are allocated locally to staging; no production customer property is reused. |
| `authority_grants` | Real confirmed operator, exact snapshot, instruction evidence hash, expiry at most 30 days. No admin or self-grant shortcut. |
| `reviews` | Exact selection and original grant, `reviewed` or `held`, explicit `agent_original_crosscheck` method. No human signoff claim. |
| `acceptances` | Exact review/grant/selection, customer/private org, CRM purpose, evidence hash and expiry bounded by the grant. |
| `revocations` | Append-only snapshot, original grant, acceptance or mapping revocation. New authority cannot revive older receipts. |
| `crm_links` | Immutable command, source, actor/org, lead and annotation link. It preserves private work after source access expires. |

Registration is `snap_receipt.register_snapshot(p_snapshot jsonb,p_records jsonb) -> uuid`. Fields are declared and strictly checked in SQL. `selection_sha256` is SHA-256 of UTF-8 version IDs ordered by record key, joined by LF without a terminal LF. Each version is SHA-256 of `record_key + original_sha256 + source_row_sha256 + cleaning_rule_version`; each record key is SHA-256 of the compact JSON array `[agency_key,"case",case_id]`. Full-address/parcel property keys use the existing importer algorithm. `source_job_id` is the receipt-processing job reference, distinct from the FOIA `request_id`; the existing cleaning pipeline binds both separately. Original bytes must be independently verified outside SQL; an `archive_verification_sha256` is an evidence reference, not server-side archive retrieval or automatic approval.

A repeated registration raises a uniqueness conflict; it never overwrites or silently replays a supplied payload. The operator must compare the saved snapshot/selection before retrying an uncertain registration. Invalid imports roll back all snapshot/record/property writes. Moving a known case to another property, conflicting identity/evidence kind, malformed row pairs or changed cleaning proof is rejected for explicit review.

Authority is `snap_receipt.grant_authority(p_id uuid,p_snapshot uuid,p_operator uuid,p_instruction_sha256 text,p_valid_until timestamptz) -> uuid`. Record only genuine current authorization. Installation, original verification, registration and an authority grant are all distinct from review or customer acceptance.

## Authenticated RPCs

| Function | Inputs and result |
|---|---|
| `fn_owner_receipt_case_snapshot_v1` | `p_snapshot_id uuid`; current manager-only scope/count/hash readback. |
| `fn_review_receipt_case_snapshot_v1` | `p_command_id uuid,p_snapshot_id uuid,p_expected_selection_sha256 text,p_outcome text,p_evidence_sha256 text`; returns review ID/outcome/replay. |
| `fn_accept_receipt_case_snapshot_v1` | `p_command_id uuid,p_review_id uuid,p_consumer_user_id uuid,p_purpose text,p_valid_until timestamptz,p_evidence_sha256 text`; purpose must be `crm`; returns acceptance ID/replay. |
| `fn_revoke_receipt_case_decision_v1` | `p_command_id uuid,p_snapshot_id uuid,p_kind text,p_target_id text,p_evidence_sha256 text`; current manager and exact target required. |
| `fn_my_receipt_case_acceptances_v1` | No arguments; current caller's active acceptances with dates/counts/evidence kind, max 1,000 saved receipts or explicit error. |
| `fn_list_receipt_case_properties_v1` | `p_acceptance_id uuid,p_limit integer=25,p_offset integer=0`; bounded property list and case count for the exact selection; `existing_lead_id` is a UUID or null for this exact acceptance/property and owned workspace. Open that lead after a completed or uncertain handoff; a new acceptance remains null until its own link is written. |
| `fn_handoff_receipt_case_to_crm_v1` | `p_request_id uuid,p_acceptance_id uuid,p_source_property_key text,p_stage_id uuid`; returns `lead_id,activity_id,source_link_id,created,replayed`. |
| `fn_get_receipt_case_crm_detail_v1` | `p_lead_id uuid`; one newest currently accepted snapshot for that owned lead, validated by `parseReceiptCaseDetail`. No mixed revisions. |

Every read/handoff checks confirmed/unbanned account, private workspace, current original authority and operator, latest exact review, immutable selection, mapping digest, CRM purpose and expiry/revocations. Source writers use one advisory lock; guards recheck the actor after waiting and reject non-READ-COMMITTED transactions. Exact handoff retry reauthorizes before returning an existing receipt. Changed command input conflicts. Local PGlite proves SQL/permission behavior, not multi-session lock races; a native concurrent test remains required before production consideration.

An acceptance is an explicit private pilot source grant. It does not debit an unlock, prove a subscription, consume export quota or authorize CSV export. The existing checkout/source-export holds are untouched. A paid journey must independently satisfy the product's billing guard and sandbox fulfillment evidence.

## CRM preservation and UI

New receipt properties are classified as source properties. The restrictive property policy always denies direct receipt-property reads/writes to authenticated callers, retaining the existing legacy branch for other properties. Receipt addresses are exposed only through the exact current-acceptance list/detail/handoff RPCs, so they never enter old generic property clients or caches. Even a legacy admin/unlock policy cannot reveal them directly while an acceptance is active or after expiry. The ordinary manual handoff continues to reject mapped source properties.

The receipt handoff uses a separate RPC and neutral initial title, `Reviewed case lead`. It creates one private lead and one system annotation; refresh reuses the property/lead and appends a new source link/annotation without updating private title, stage, assignments, notes, contacts, DNC, follow-up, amounts or `updated_at`. Revocation hides source properties/detail/annotations while the account-owned lead, private activities and contacts remain readable/editable. Source-linked identities and source annotations cannot be deleted/reparented. Private account export already excludes all system annotations.

Customer detail includes only cleaned case facts and citation fields. Required labels explain case semantics, reviewed-subset coverage and unverified cadence. It exposes neither raw original correspondence/narratives nor operator identities/review evidence. `snapshot.evidence_kind` distinguishes synthetic test material. `snapshot.acceptance_id` and `snapshot.valid_until` let the UI evict source evidence at its precise acceptance deadline; server revocation still requires a new read/refetch, not a stale-data fallback. The legacy detail RPC stays held; the new UI must use the receipt-specific reader and caller-aware cache keys.

## Hosted synthetic proof (explicit execution only)

`hosted.mjs` has three resumable phases. Importing it or asking for `--help` performs no network work. Before execution, independently review and freeze its SHA-256. The release operator supplies a canonical private directory outside Git with mode `0700` and a mode `0600` JSON configuration containing exactly `project_ref`, `expected_fixture_nonce`, `anon_key`, `service_role_key` and `operator_authority_reference_sha256`. The last value must hash the genuine scoped staging instruction; it is not human source approval. Never commit or print the configuration, state, generated SQL or raw HTTP responses.

```sh
node scripts/tests/release-hosted-source/hosted.mjs prepare-auth --config /private/source-proof/config.json --state /private/source-proof/state.json
# Operator reviews and manually applies generated /private/source-proof/initial.sql.
node scripts/tests/release-hosted-source/hosted.mjs initial --config /private/source-proof/config.json --state /private/source-proof/state.json
# Operator reviews and manually applies generated /private/source-proof/refresh.sql.
node scripts/tests/release-hosted-source/hosted.mjs refresh --config /private/source-proof/config.json --state /private/source-proof/state.json
```

These are instructions, not evidence that a run occurred. Every phase first verifies the exact ready fixture nonce and held checkout through the bound staging API. The runner creates only three unique synthetic `.invalid` Auth users, confirms them without sending email, and signs in through real password/refresh sessions. It verifies their ordinary roles and distinct private workspaces. It never executes SQL, creates paid entitlements, invokes provider functions or changes production/Ops. Generated SQL registers only the explicitly synthetic scope and bounded operator authority; real authenticated operator RPCs subsequently record review and customer acceptance with current timestamps.

The initial phase tests A's exact accepted detail/handoff/retry, B and foreign-stage denials, direct property-table denial, and exact readback of each private customer field, note, task and contact/DNC. The refresh phase compares the complete saved private rows across a new synthetic revision, revocation and actual short expiry. Denial must be HTTP `403` with PostgreSQL `42501`; missing routes, invalid tokens and server errors cannot pass. Saved command IDs permit exact retries after uncertain writes. A completed phase rerun performs fresh checks. Do not blindly replay generated registration SQL after an uncertain apply; reconcile its stored identity and selection first.

The final receipt still marks browser acceptance, actual original-backed acceptance and native concurrent revocation races pending. Synthetic revisions establish preservation mechanics, not recurring municipal freshness. Referenced Auth accounts are retained by restrictive history foreign keys; this runner performs no destructive cleanup.

## Verification and limits

Run offline:

```sh
node --test tests/receipt-case-contract.test.mjs tests/receipt-case-db.test.mjs tests/receipt-case-preflight.test.mjs tests/receipt-case-hosted-harness.test.mjs
```

`fixture.mjs` loads the exact hosted baseline into ephemeral PGlite with explicitly local Auth test doubles. It never installs those doubles in managed Supabase. Synthetic fixtures cover lineage/hash rejection, held subset accounting, ordinary customer/operator separation, exact retry, refresh, expiry/revocation, customer work preservation and direct-access denial. Public test fixtures contain only invented source values. Private original-backed registration proof, if performed, is saved outside Git and is separate from authenticated hosted acceptance.

Before claiming the actual-source gates, root must perform the bounded private original-backed import, real GoTrue operator review/customer acceptance, A/B HTTP and browser checks, ban/token refresh and account-switch checks, and exact notes/contact preservation across revocation. A synthetic next delivery demonstrates mechanics only; recurring freshness requires another real original-backed delivery and an operational cadence. No local pass represents customer release, hosted acceptance, human signoff or production deployment.

This staging adapter deliberately blocks hard deletion of referenced Auth identities and source/CRM history. Production account-erasure/retention handling needs its own reviewed design; do not promote this staging schema as a complete production migration. Native concurrency, full production catalog compatibility, source CSV/export authorization and restore rehearsal also remain separate.

For rollback, revoke the new source decisions first. Preserve the mapping classification and restrictive fences: dropping them could make source properties look ordinary. Keep immutable source receipts/property IDs and customer CRM work. Do not delete/reparent rows or restore shared access as a rollback.
