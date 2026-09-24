# Madison Heights validation — September 24, 2026

**Result: HOLD. No customer market accepted or published.** The private intake is internally consistent on the checks below. Original-file accuracy, the 90 pre-import exceptions, and a complete customer journey remain unverified in this execution environment. The user authorized implementation of the relaunch sequence; this report supersedes the audit's implementation-only permission wording, not its unmet release gates.

## Verified through new read-only native queries

Project: Lovable `6082ede1-ff48-4b44-926f-7dbadb14f9e1`, database `ojyxblegxpdgaqiscxpz`. Queries used the enabled Lovable database connector. No original row narratives, addresses, owner identifiers or contact data are copied here.

| Fact | Observed result |
|---|---|
| Receipt | `0125f777-162e-52cb-b33e-f58c3add3899` |
| Original SHA-256 recorded by receipt | `125f123a6bedc3d2c870738d5e29bab1c918132ce1169bffa609738e9990e0dc` |
| Receipt received | September 23, 2026, 13:02 UTC |
| Private import | September 23, 2026, 17:33:12 UTC |
| Original cases / passing cases | 332 / 242 |
| Import-stage rejected cases | 0 of the 242 passing candidates |
| Pre-import exceptions | 90 by receipt subtraction; reasons not independently reviewed this turn |
| Distinct stored case keys / source-row hashes | 242 / 242 |
| Distinct stored original hashes / archives | 1 / 1 |
| Cleaned-description hash mismatches | 0 of 242 |
| Wrong stored jurisdiction | 0 of 242 |
| Stored date-order errors | 0 of 242: closed before filed, filed after report, or closed after report |
| Stored description differs from reviewed category/status template | 0 of 242 |
| Customer source acceptances / source CRM links | 0 / 0 |

Earlier audit aggregates remain 190 distinct source-property keys, source report September 23, and filed dates August 24–September 18. Those specific aggregate values were not recomputed by the successful new queries. A combined recomputation was canceled; it is not counted as verification.

The case statuses materially change the market proposition:

| Agency status | Cases | Closed date present | Legacy customer-property match present |
|---|---:|---:|---:|
| COMPLIED | 136 | 136 | 4 |
| VIOLATION | 39 | 0 | 1 |
| NO VIOLATION SEEN | 19 | 17 | 2 |
| CANCELLED | 3 | 3 | 0 |
| Not supplied | 45 | 0 | 1 |
| **Total** | **242** | **156** | **8** |

**242 case records are not 242 active violations or motivated sellers.** Only 39 carry the agency's `VIOLATION` label, as of this report. That label still does not prove current conditions, seller intent, occupancy, liens, or investment viability. The two `NO VIOLATION SEEN` rows lacking a closed date require source review; do not invent one. The 234 absent legacy property matches are not necessarily errors: this import intentionally supports private source-property identities. They are an unproven dependency for a customer property/CRM journey.

These checks validate stored consistency. A valid stored hash does not verify an original's bytes or a human mapping decision. No independent original-to-customer sample was completed.

## Why original verification is blocked

The existing worker reads `original.bin` from the separate Ops receipt archive after checking request proof and archive integrity (`ops/city-response/runtime/receipt_cleaning.py`, `prepare`). Its `collection_receipt_observations`, receipt-cleaning history, request-proof tables and archive objects are not available in the Snap database catalog inspected here.

The workspace contains no matching original. A bounded search of Snap Storage metadata found nine Madison-named historical objects; none was this September 23 receipt. One was an older Madison Heights February 9 file; others were different jurisdictions. They were not substituted. A targeted connected-mailbox search for September 22–24 and Madison Heights/Enforcement List returned no matching message. This does not establish that the delivery is absent from the separate Ops mailbox/archive.

**Next required input:** the authorized receipt operator's existing original bytes, the original request/agency/date binding and verified archive reference, saved cleaning/exception report, and a read-only export of this receipt's private records. Use the existing archive read path; no new FOIA request, ingestion replay, provider call, or public upload is needed. Do not use the receipt worker's `prepare()` merely to fetch evidence: it can restore files and record request evidence.

## Repeatable offline gate now implemented

`ops/city-response/runtime/market_validation.py` is an offline verifier, separate from ingestion. It has no database/network client, publication path, or write operation. It reuses the reviewed adapter to compare every passing original case against a bounded export, including identities, jurisdiction, property hash, status, dates, cleaned facts, hashes, source-row citations and archive provenance. Missing, extra, duplicate, or changed imported records hold the result.

The operator must independently review the original in addition to the automated comparison. Reusing the production parser is useful for detecting import drift but cannot detect a shared interpretation error by itself.

1. Export context into a private JSON file with `agency_key`, `adapter_version`, `receipt_id`, `request_id`, `original_sha256`, `period_start`, `period_end`, `archive_id`, `archive_manifest_sha256`, `archive_verified`, `binding_evidence_ref`, `original_row_count`, `passing_row_count`, `freshness_policy_ref`, `isolation_test_receipt`, and `refresh_preservation_receipt`.
2. Export the matching receipt's `cleaned_receipt_records_v1` rows, including the exact fields returned by `expected_row()` in the script. Do not export other receipts or owner identities. The file is private even though output is minimized.
3. Run with the exact retained original bytes:

   ```sh
   python3 ops/city-response/runtime/market_validation.py \
     --original /private/receipt/original.bin \
     --context /private/receipt/context.json \
     --stored-rows /private/receipt/stored-rows.json \
     --reviews /private/receipt/manual-reviews.json
   ```

4. Initially omit `--reviews` to obtain a deterministic sample. It selects at least 60 passing cases per source, at least 30 per distinct status stratum where available (all if fewer), all exceptions, and additional detected unit/status-date ambiguity. New source-specific risks must be added by the reviewer rather than hidden inside an overall percentage. For the current passing status counts, the initial status-only floor is **112 passing cases**, plus **all 90 exceptions**, before additional risk selections. Actual selection requires original bytes and may be larger. These are proposed risk-screen thresholds, not statistically proven accuracy guarantees.
5. For every selected item record `review_id`, exact `source_rows`, `reviewer`, `reviewed_at`, `evidence_ref`, and `identity`, `status`, `dates`, `provenance`, `privacy` each as `pass` or `fail`. A passing record's disposition is `verified_for_owner_review`; an exception's is `keep_held`. An exception passing review means it is correctly held, not accepted. Duplicate physical source rows require separate review entries.
6. Any field mismatch, unexplained exception, failed review, absent archive/request proof, undeclared freshness policy, or missing isolation/CRM-preservation receipt yields `HOLD` (exit 2). All checks passing produces only `READY_FOR_OWNER_REVIEW` (exit 0), always with `customer_release_authorized: false`. Evidence references are operator attestations, not signed authorization; this command cannot grant access.

The output includes hashes, source row positions, status strata and reason codes; it omits addresses, parcel identifiers, case IDs and raw narratives. Keep input exports and review outputs outside the source repository and out of public pilot materials. A later explicit market acceptance and customer authorization test remain separate.

## Release unit and remaining gates

Candidate unit: **Madison Heights, Michigan × enforcement-case list × reviewed adapter v1 × September 23 report**. It is not nationwide coverage and is not approved as the pilot market yet.

| Gate | Status | Completion evidence |
|---|---|---|
| Stored private record consistency | PASS for enumerated native checks | Aggregate native results above |
| Original bytes / archive / original request proof | BLOCKED | Retained source rehash and bound proof read |
| Source semantics and every exception | BLOCKED | Original-backed sample and exception ledger |
| Repeat intake, changes, closure, missing-row semantics | UNTESTED | Two reports or isolated transition fixtures with no inferred closure from omission |
| Declared refresh cadence and overdue behavior | UNVERIFIED | Measured/delivered cadence or explicit unknown; stale view test |
| Private property-to-CRM customer path | UNTESTED | Entitled user can view/save/reload; legacy match not assumed required |
| Tenant isolation and history preservation | DEPENDENCY | Release-specific adversarial and source-revocation receipts |
| Customer acceptance/publication | HELD | Explicit approved release unit and successful acceptance/revocation execution |

The new verifier's nine regression tests pass. They cover semantic drift at equal counts, source tampering, foreign jurisdictions, missing/extra/duplicate records, manual-review failure, every exception, sample floors, privacy-safe output, and the non-publication invariant. Existing city-response tests also run independently; no ingestion behavior changed.

## Candidate public coverage statement after acceptance only

“Madison Heights, Michigan: agency enforcement cases from the report dated September 23, 2026. Cases include complied, cancelled, no-violation-seen and unspecified statuses. Read the individual agency status and dates. Updates follow available source deliveries; current condition and seller intent require independent verification.”

Do not display this as available coverage until the release gates pass. Do not substitute “fresh weekly leads” for an unverified delivery cadence.
