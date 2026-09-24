"""Offline original-to-private-import verification; never publishes or connects.

Inputs must come from the authorized receipt operator. A successful result means
ready for owner review, never customer acceptance. Output omits addresses,
parcels, case identifiers, original narrative and customer identities.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import sys

from record_privacy import MADISON_VERSION, clean_madison, normalize_address

AGENCY = "us:mi:madisonheights"
CHECKS = ("identity", "status", "dates", "provenance", "privacy")


def review_id(record):
    return record["record_key"] + ":" + record["evidence"]["source_row_hash"]


def sample_plan(records):
    """Stable status strata plus every exception and unit ambiguity.

    Proposed floor: 60 passing cases/source (or all), 30 per status stratum
    (or all); higher-risk unit and status/date anomalies are added, not traded
    away against the minimum. Operator must add newly discovered risk strata.
    """
    accepted = [r for r in records if r["accuracy_status"] == "passed"]
    groups = defaultdict(list)
    reasons = defaultdict(set)
    for record in records:
        key = review_id(record)
        if record["accuracy_status"] != "passed":
            reasons[key].add("exception")
        else:
            groups[record["source_status"]].append(record)
            if "#" in record["address"] or "/" in record["address"]:
                reasons[key].add("unit_or_address_ambiguity")
            if record["source_status"] in ("COMPLIED", "CANCELLED", "NO VIOLATION SEEN") and not record["closed_date"]:
                reasons[key].add("status_without_closed_date")
    rank = lambda r: hashlib.sha256(review_id(r).encode()).hexdigest()
    for group in groups.values():
        for record in sorted(group, key=rank)[:30]:
            reasons[review_id(record)].add("status_stratum")
    chosen = sum(review_id(r) in reasons for r in accepted)
    for record in sorted(accepted, key=rank):
        if chosen >= min(60, len(accepted)):
            break
        if review_id(record) not in reasons:
            reasons[review_id(record)].add("source_minimum")
            chosen += 1
    # Identical duplicate case rows have distinct physical row positions. Include
    # those positions in the output rather than hiding the held duplicate.
    return [dict(review_id=review_id(r), source_rows=r["evidence"]["source_rows"],
                 source_status=r["source_status"], disposition=r["accuracy_status"],
                 review_reasons=r["review_reasons"], selection_reasons=sorted(reasons[review_id(r)]))
            for r in records if review_id(r) in reasons]


def expected_row(record, context, report_date):
    evidence = record["evidence"]
    property_key = hashlib.sha256((AGENCY + "\x1f" + record["parcel_id"] + "\x1f" + normalize_address(record["address"])).encode()).hexdigest()
    return dict(record_key=record["record_key"], case_id=record["case_id"],
                record_kind="case", agency_key=AGENCY, source_property_key=property_key,
                address=record["address"], city="Madison Heights", state="MI",
                source_parcel_reference=record["parcel_id"], category=record["category"],
                source_status=record["source_status"], filed_date=record["filed_date"],
                closed_date=record["closed_date"], cleaned_description=record["cleaned_description"],
                cleaned_sha256=record["privacy"]["cleaned_hash"],
                cleaning_rule_version="record-privacy-v1:" + MADISON_VERSION,
                source_row_sha256=evidence["source_row_hash"], original_sha256=evidence["original_sha256"],
                source_rows=evidence["source_rows"], receipt_id=context["receipt_id"],
                request_id=context["request_id"], archive_id=context["archive_id"],
                archive_manifest_sha256=context["archive_manifest_sha256"], report_date=report_date)


def validate(raw, context, stored_rows, reviews=None):
    """No side effects. Context is an operator-bound export, not source claims."""
    result = dict(version="market-validation-v1", market=AGENCY, status="HOLD",
                  customer_release_authorized=False, network_calls=0, writes=0,
                  blockers=[], mismatches=[], sample=[], counts={})
    blockers = result["blockers"]
    required = ("receipt_id", "request_id", "original_sha256", "period_start", "period_end",
                "archive_id", "archive_manifest_sha256", "original_row_count", "passing_row_count")
    if not isinstance(context, dict) or any(context.get(k) is None for k in required):
        blockers.append("bound_receipt_context_incomplete")
        return result
    if raw is None:
        blockers.append("original_bytes_unavailable")
        return result
    if hashlib.sha256(raw).hexdigest() != context["original_sha256"]:
        blockers.append("original_hash_mismatch")
        return result
    if context.get("agency_key") != AGENCY or context.get("adapter_version") != MADISON_VERSION:
        blockers.append("unreviewed_agency_or_adapter")
        return result
    if context.get("archive_verified") is not True or not context.get("binding_evidence_ref"):
        blockers.append("archive_or_request_binding_not_verified")
    try:
        report = clean_madison(raw, agency_key=AGENCY, expected_agency_key=AGENCY,
                               request_id=context["request_id"], receipt_id=context["receipt_id"],
                               period_start=context["period_start"], period_end=context["period_end"])
    except (ValueError, TypeError):
        blockers.append("original_layout_or_semantics_rejected")
        return result
    result["original_sha256"] = report["original_sha256"]
    result["counts"] = dict(original_cases=report["input_records"], physical_rows=report["physical_rows"],
                            passing_cases=report["passed_records"], exceptions=report["held_records"],
                            passing_status_counts=dict(Counter(r["source_status"] for r in report["records"] if r["accuracy_status"] == "passed")))
    if (context["original_row_count"], context["passing_row_count"]) != (report["input_records"], report["passed_records"]):
        blockers.append("receipt_counts_mismatch")
    if not isinstance(stored_rows, list):
        blockers.append("private_import_export_unavailable")
        stored_rows = []
    indexed = {}
    for row in stored_rows:
        if not isinstance(row, dict):
            blockers.append("private_import_export_invalid")
            continue
        key = row.get("record_key")
        if key in indexed:
            blockers.append("duplicate_stored_record")
        indexed[key] = row
    expected = [r for r in report["records"] if r["accuracy_status"] == "passed"]
    if set(indexed) != {r["record_key"] for r in expected}:
        blockers.append("private_import_record_set_mismatch")
    for record in expected:
        actual = indexed.get(record["record_key"], {})
        fields = [key for key, value in expected_row(record, context, report["report_date"]).items() if actual.get(key) != value]
        if fields:
            # Field names and hashes only. Never echo source or private values.
            result["mismatches"].append(dict(review_id=review_id(record), fields=fields))
    if result["mismatches"]:
        blockers.append("original_to_import_mismatch")
    result["sample"] = sample_plan(report["records"])
    result["counts"]["sampled_passing_cases"] = sum(r["disposition"] == "passed" for r in result["sample"])
    result["counts"]["sampled_exceptions"] = sum(r["disposition"] != "passed" for r in result["sample"])
    reviews = reviews if isinstance(reviews, list) else []
    # Key includes physical positions, so an identical duplicate cannot borrow
    # the accepted row's manual approval.
    reviewed = {}
    for entry in reviews:
        if not isinstance(entry, dict):
            blockers.append("manual_review_invalid")
            continue
        key = (entry.get("review_id"), tuple(entry.get("source_rows", [])))
        if key in reviewed:
            blockers.append("duplicate_manual_review")
        reviewed[key] = entry
    for sample in result["sample"]:
        entry = reviewed.get((sample["review_id"], tuple(sample["source_rows"])), {})
        expected_disposition = "verified_for_owner_review" if sample["disposition"] == "passed" else "keep_held"
        if (entry.get("disposition") != expected_disposition or not entry.get("reviewer") or
            not entry.get("reviewed_at") or not entry.get("evidence_ref") or
            any(entry.get(check) != "pass" for check in CHECKS)):
            blockers.append("manual_original_review_incomplete_or_failed")
    if not context.get("freshness_policy_ref"):
        blockers.append("freshness_cadence_unverified")
    if not context.get("isolation_test_receipt"):
        blockers.append("customer_isolation_unverified")
    if not context.get("refresh_preservation_receipt"):
        blockers.append("crm_refresh_preservation_unverified")
    result["blockers"] = sorted(set(blockers))
    if not result["blockers"]:
        result["status"] = "READY_FOR_OWNER_REVIEW"
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--original", type=Path)
    parser.add_argument("--context", type=Path, required=True)
    parser.add_argument("--stored-rows", type=Path)
    parser.add_argument("--reviews", type=Path)
    args = parser.parse_args()
    try:
        read_json = lambda path: json.loads(path.read_text()) if path else None
        result = validate(args.original.read_bytes() if args.original else None,
                          read_json(args.context), read_json(args.stored_rows), read_json(args.reviews))
    except (OSError, ValueError, TypeError):
        # An unexpected source value or filesystem path must not leak via errors.
        result = dict(version="market-validation-v1", status="HOLD", customer_release_authorized=False,
                      blockers=["input_unreadable_or_invalid"])
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["status"] == "READY_FOR_OWNER_REVIEW" else 2


if __name__ == "__main__":
    sys.exit(main())
