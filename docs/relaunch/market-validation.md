# Market validation status and operator procedure

**Release state: HOLD. No market accepted or published.** The original source file, receipt and manifest have been recovered and their expected hashes match. Independent reconstruction and agent inspection of the required source sample and held exceptions completed without import drift. Detailed evidence remains private. A remaining archived observation object was not downloaded; full archive byte verification is incomplete. Source inspection does not establish coverage completeness or customer delivery.

The requested-period discrepancy is resolved only for a limited, dated pilot snapshot of the exact reviewed subset. Historical request/report filters are unchanged and all excluded records remain held. The proposed claim states the source-report date and observed included filing dates, labels coverage as partial, preserves agency status, and makes no claim about current conditions, seller intent or future updates. Full requested-period fulfillment remains unverified. The private scope decision does not itself accept or publish the source.

Source identities, archive locations, actual hashes, raw records, exception ledgers and private evidence counts are intentionally absent from this public report. Retain them in the approved private evidence store. Access to an original does not authorize its upload to Git, a public preview, a new service or a staging clone.

## Offline verification

`ops/city-response/runtime/market_validation.py` is an offline verifier, separate from ingestion. It has no database/network client, publication path or write operation. It compares original parsing against a bounded private import export, including identity, status, dates, cleaned facts, provenance and source citations. Missing, extra, duplicate or changed records hold the result.

Use only an approved local private working directory. The paths below are placeholders, not infrastructure locations:

```sh
python3 ops/city-response/runtime/market_validation.py \
  --original /PRIVATE_REVIEW_DIR/original.bin \
  --context /PRIVATE_REVIEW_DIR/context.json \
  --stored-rows /PRIVATE_REVIEW_DIR/stored-rows.json \
  --reviews /PRIVATE_REVIEW_DIR/manual-reviews.json
```

1. Record the exact approved request, receipt/archive binding, original hash, requested period, adapter version, row accounting, freshness policy and authorization-preservation evidence in private context.
2. Export only the reviewed receipt's required fields into private input files. Do not broaden an export to unrelated receipts or owner identities.
3. Rehash the original and archive manifest. Independently inspect headers, report filter/footer, case/status semantics and source-period boundaries.
4. Initially omit `--reviews` to obtain the deterministic sample. Review every required sampled item and all held exceptions against the original. Reusing the same parser cannot alone detect shared interpretation errors.
5. Record reviewer, source-row references, review time, evidence reference and pass/fail for identity, status, dates, provenance and privacy. A correctly held exception remains held.
6. Keep inputs and row-level review outputs private. Any mismatch, unexplained exception, failed review, missing provenance, undeclared freshness or missing authorization-preservation evidence returns `HOLD`.

Even a passing verifier returns only `READY_FOR_OWNER_REVIEW` with `customer_release_authorized: false`. It cannot grant customer access.

## Remaining acceptance

- Retrieve and rehash the remaining archived observation. Agent source inspection and the narrow snapshot interpretation are complete; no human sign-off is claimed.
- Deploy and verify the bounded snapshot wording against the accepted subset. A fixed dated pilot promises no update schedule; a recurring freshness offer requires separately verified delivery and refresh behavior.
- Exercise actual isolated customer authorization, approved handoff, expiry/revocation and preservation of private CRM work.
- Obtain explicit market acceptance before customer delivery or buyer pilot use.

The Python suite and market verifier regression tests are implementation evidence only. See [verification.json](verification.json) for recorded test results. Synthetic internal examples must stay clearly labeled and cannot count as validated market inventory.
