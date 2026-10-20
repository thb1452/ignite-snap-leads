"""Buffalo-only adapter over the retained, hash-pinned source files."""
from __future__ import annotations

import collections
import csv
import datetime as dt
import gzip
import importlib.util
import json
from pathlib import Path
import re
import shutil

from common import (CLASS_TYPES, DEFINITIONS_URL, FULL_SNAPSHOT_SHA, HELD_IDS,
                    JURISDICTION, MANIFEST_SHA, SOURCE, VERSION, UNKNOWN_CATALOG,
                    canonical, digest, file_hash, now, read_json, require,
                    timestamp, without_hash, write_json)

# No street suffix guessing, unit stripping, geocoding, or parcel-number coercion.
def address_key(row):
    return tuple(re.sub(r"\s+", " ", str(row.get(k, "")).strip().upper())
                 for k in ("address", "city", "state", "zip"))


def source_fields(row):
    return {k: v for k, v in row.items() if not k.startswith("audit_")}


def business_key(row):
    return digest({k: v for k, v in source_fields(row).items() if k not in {"uniquekey", ":id"}})


def same_agency_record(csv_record, json_record):
    """Known CSV serialization only: omitted empty fields and JSON object cells.

    Both originals and both hashes are retained; all substantive values must agree.
    """
    left, right = source_fields(csv_record), source_fields(json_record)
    for key in set(left) | set(right):
        a, b = left.get(key), right.get(key)
        if (a is None or a == "") and (b is None or b == ""):
            continue
        if isinstance(b, (dict, list)) and isinstance(a, str):
            try:
                a = json.loads(a)
            except ValueError:
                return False
        if a != b:
            return False
    return True


def original_address(row):
    return {k: row.get(k, "") for k in ("address", "city", "state", "zip")}


def load_retained(prepared):
    prepared = Path(prepared)
    require(file_hash(prepared / "batch_manifest.json") == MANIFEST_SHA, "Unreviewed Buffalo manifest")
    manifest = read_json(prepared / "batch_manifest.json")
    for artifact in manifest["artifacts"]:
        path = prepared / artifact["name"]
        require(path.stat().st_size == artifact["bytes"] and file_hash(path) == artifact["sha256"],
                "Retained artifact changed: " + artifact["name"])
    with (prepared / "cleaned_records.csv").open(newline="", encoding="utf-8") as stream:
        rows = list(csv.DictReader(stream))
    with gzip.open(prepared / "raw_selected_records.jsonl.gz", "rt", encoding="utf-8") as stream:
        originals = [json.loads(line) for line in stream]
    require(len(rows) == len({r["agency_record_id"] for r in rows}) == 984, "Event identities changed")
    raw = {str(r["source_record"]["uniquekey"]): r for r in originals}
    require(len(raw) == len(originals) == 988, "Raw identities changed")
    require(set(raw) - {r["agency_record_id"] for r in rows} == HELD_IDS, "Held identities changed")
    # Reuse the merged cleaner; verify every field, rather than trusting a new mapping.
    cleaner_path = Path(__file__).resolve().parent.parent / "buffalo-pilot/runtime/clean_buffalo.py"
    spec = importlib.util.spec_from_file_location("retained_buffalo_cleaner", cleaner_path)
    cleaner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cleaner)
    for row in rows:
        original = raw[row["agency_record_id"]]
        require(cleaner.normalized_record(original["source_record"], original["input_row_number"],
                manifest["source"]["snapshot_finished_at"], manifest["source"]["input_sha256"]) == row,
                "Cleaned/original mismatch: " + row["agency_record_id"])
        require(digest(source_fields(original["source_record"])) == row["source_content_hash"], "Raw hash mismatch")
    require(len({r["case_number"] for r in rows}) == 322, "Case total changed")
    require(len({address_key(r) for r in rows}) == 307, "Address total changed")
    require(len({r["parcel_id"] for r in rows}) == 376, "Parcel-reference total changed")
    return manifest, rows, raw


def build_snapshot_index(snapshot, retained_ids):
    """Check identities against the already-collected full Buffalo snapshot only."""
    require(file_hash(snapshot) == FULL_SNAPSHOT_SHA, "Original Buffalo snapshot hash mismatch")
    by_parcel, by_address, observed_events = collections.defaultdict(list), collections.defaultdict(list), {}
    count = 0
    with gzip.open(snapshot, "rt", encoding="utf-8") as stream:
        for count, line in enumerate(stream, 1):
            r = json.loads(line)
            # Keep only identity fields in the crosswalk, never inspector/contact details.
            observation = {"parcel_id": str(r.get("sbl", "")), **original_address(r),
                           "property_class": str(r.get("propclass", "")),
                           "agency_record_id": str(r.get("uniquekey", "")),
                           "source_violation_date": r.get("date"), "snapshot_row": count}
            by_parcel[observation["parcel_id"]].append(observation)
            by_address[address_key(observation)].append(observation)
            if observation["agency_record_id"] in retained_ids:
                require(observation["agency_record_id"] not in observed_events, "Duplicate full-snapshot violation ID")
                observed_events[observation["agency_record_id"]] = r
    require(count == 257696, "Full snapshot row total changed")
    return by_parcel, by_address, observed_events


def candidate_reasons(rows, parcel_observations, address_observations):
    reasons = []
    parcel = rows[0].get("parcel_id", "")
    if not re.fullmatch(r"\d{16}", parcel):
        reasons.append("unsupported_parcel_reference_format")
    addresses = {address_key(r) for r in rows}
    if len(addresses) != 1 or any(not all(address_key(r)) or r.get("city") != "BUFFALO"
                                  or r.get("state") != "NY" or not re.fullmatch(r"\d{5}", r.get("zip", ""))
                                  for r in rows):
        reasons.append("missing_or_conflicting_complete_address")
    if any(not re.fullmatch(r"\d+[A-Za-z]? [A-Za-z0-9 .'-]+", r.get("address", "")) for r in rows):
        reasons.append("unit_or_range_match_needs_review")
    classes = {r.get("property_class", "") for r in rows}
    if len(classes) != 1 or not classes <= CLASS_TYPES.keys():
        reasons.append("classification_missing_conflicting_or_outside_pilot")
    if not parcel_observations or not address_observations:
        reasons.append("snapshot_identity_observations_missing")
    if {r["parcel_id"] for r in address_observations} != {parcel}:
        reasons.append("address_has_multiple_parcel_references")
    if {address_key(r) for r in parcel_observations} != addresses:
        reasons.append("parcel_has_multiple_addresses")
    if {r["property_class"] for r in parcel_observations + address_observations} != classes:
        reasons.append("snapshot_classification_conflict_requires_assessor")
    if any(not r.get(k) for r in rows for k in ("agency_record_id", "case_number", "violation_description",
                                                  "violation_date", "snapshot_finished_at", "source_content_hash")):
        reasons.append("required_event_field_missing")
    return reasons


def summarize(events, as_of):
    dates = [dt.date.fromisoformat(e["violation_date"]) for e in events]
    collected = [timestamp(e["collected_at"]) for e in events]
    at = timestamp(as_of)
    require(all(t <= at for t in collected), "Future collection time")
    require(all(d <= timestamp(e["collected_at"]).date() for d, e in zip(dates, events)), "Future violation date")
    return {
        "selected_violation_count": len(events), "selected_case_count": len({e["case_number"] for e in events}),
        "status_counts_as_collected": dict(sorted(collections.Counter(e["status_as_collected"] for e in events).items())),
        "description_counts": dict(sorted(collections.Counter(e["description"] for e in events).items())),
        "earliest_violation_date": min(dates).isoformat(), "latest_violation_date": max(dates).isoformat(),
        "selected_violation_date_span_days": (max(dates) - min(dates)).days,
        "oldest_collection": min(collected).isoformat(), "newest_collection": max(collected).isoformat(),
        "collection_age_hours_at_preparation": round((at - min(collected)).total_seconds() / 3600, 4),
        "collection_review_threshold_hours": 48, "older_than_review_threshold_at_preparation": (at - min(collected)).total_seconds() > 48 * 3600,
        "case_opened_at": None, "days_open": None, "upstream_update_time": None,
    }


def redact(text):
    # The original stays in the private source companion. Model input gets no emails/phones.
    text = re.sub(r"\s*\([A-Z][a-z]+(?: [A-Z][a-z]+){1,3}\)\s*(?=(?:\+?1[ .-]?)?(?:\(\d{3}\)|\d{3})[ .-]\d{3}[ .-]\d{4})",
                  " [contact redacted] ", text)
    text = re.sub(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", "[contact redacted]", text)
    text = re.sub(r"(?<!\w)(?:\+?1[ .-]?)?(?:\(\d{3}\)|\d{3})[ .-]\d{3}[ .-]\d{4}(?!\w)",
                  "[contact redacted]", text)
    return re.sub(r"(?:\[contact redacted\]\s*){2,}", "[contact redacted]", text)


def build_package(rows, originals, observations, as_of):
    first = rows[0]
    events = []
    for r in sorted(rows, key=lambda e: (e["violation_date"], int(e["agency_record_id"]))):
        events.append({"ref": "BUF-" + r["agency_record_id"], "agency_record_id": r["agency_record_id"],
            "case_number": r["case_number"], "parcel_id": r["parcel_id"], "jurisdiction": JURISDICTION,
            "address": original_address(r), "property_class_original": r["property_class"],
            "description": redact(r["violation_description"]), "comments": redact(r["comments"]),
            "violation_location": redact(r["violation_location"]), "case_type": r["case_type"],
            "code": r["violation_code"], "code_section": r["code_section"],
            "violation_date": r["violation_date"], "source_date_raw": r["source_date_raw"],
            "case_opened_at": None, "status_as_collected": r["source_status"],
            "source_url": SOURCE, "record_url": SOURCE + "?%24where=uniquekey%3D%27" + r["agency_record_id"] + "%27",
            "collected_at": r["snapshot_finished_at"], "original_sha256": r["source_content_hash"],
            "agency_json_sha256": digest(originals[r["agency_record_id"]]),
            "preparation_source_row": int(r["source_row_number"]),
            "original_record_file": "originals.json", "agency_json_record_file": "agency_originals.json",
            "source_text_is_untrusted": True})
    original_codes = sorted({r["property_class"] for r in rows})
    package = {"version": VERSION, "property_key": JURISDICTION + ":" + first["parcel_id"],
        "jurisdiction": JURISDICTION, "parcel_id": first["parcel_id"], "address": original_address(first),
        "classification": {"original_field": "propclass", "original_codes": original_codes,
            "specific_property_type": CLASS_TYPES[first["property_class"]], "residential_workflow_eligible": True,
            "basis": "Consistent agency classification in retained records and retained snapshot identity observations",
            "classification_observed_at": first["snapshot_finished_at"], "definitions_url": DEFINITIONS_URL,
            "definitions_verified_at": as_of, "identity_verified_at": as_of,
            "independent_current_use_check": False, "independent_assessor_check": False,
            "condominium_status": "unknown", "townhouse_status": "unknown", "detached_status": "unknown"},
        "source_acceptance": {"scope": "private_local_pilot_only", "retained_manifest_sha256": MANIFEST_SHA,
            "full_snapshot_sha256": FULL_SNAPSHOT_SHA, "source_url": SOURCE,
            "production_acceptance": False, "production_generation_authorized": False},
        "selection": {"from_inclusive": "2026-09-20", "through_inclusive": "2026-10-20",
            "status_filter": "ACTIVE", "full_history": False, "not_an_investment_ranking": True},
        "identity_observations": sorted(observations, key=lambda r: r["snapshot_row"]),
        "prepared_at": as_of, "events": events, "summary": summarize(events, as_of),
        "unknowns": UNKNOWN_CATALOG, "source_text_is_untrusted": True}
    package["input_sha256"] = digest(package)
    return package


def validate_package(p):
    require(p["version"] == VERSION and p["jurisdiction"] == JURISDICTION, "Wrong pilot jurisdiction")
    require(p["input_sha256"] == digest(without_hash(p)), "Evidence input hash mismatch")
    require(p["property_key"] == JURISDICTION + ":" + p["parcel_id"], "Property key mismatch")
    require(p["source_acceptance"] == {"scope": "private_local_pilot_only", "retained_manifest_sha256": MANIFEST_SHA,
        "full_snapshot_sha256": FULL_SNAPSHOT_SHA, "source_url": SOURCE,
        "production_acceptance": False, "production_generation_authorized": False}, "Source acceptance mismatch")
    require(p["classification"]["original_codes"] in [[x] for x in CLASS_TYPES], "Unsupported classification")
    code = p["classification"]["original_codes"][0]
    require(p["classification"]["specific_property_type"] == CLASS_TYPES[code], "Classification definition mismatch")
    require(p["classification"]["residential_workflow_eligible"] is True and
            p["classification"]["independent_current_use_check"] is False and
            p["classification"]["independent_assessor_check"] is False, "Classification scope mismatch")
    require(p["unknowns"] == UNKNOWN_CATALOG, "Required unknowns changed")
    events = p["events"]
    require(bool(events) and len(events) == len({e["agency_record_id"] for e in events}), "Duplicate or missing event")
    require(not HELD_IDS & {e["agency_record_id"] for e in events}, "Held event included")
    require(all(e["parcel_id"] == p["parcel_id"] and e["jurisdiction"] == JURISDICTION and
                address_key(e["address"]) == address_key(p["address"]) and e["property_class_original"] == code and
                e["ref"] == "BUF-" + e["agency_record_id"] and e["source_url"] == SOURCE and
                e["case_opened_at"] is None and e["source_text_is_untrusted"] is True for e in events), "Event identity mismatch")
    require(p["summary"] == summarize(events, p["prepared_at"]), "Counts or date comparisons changed")
    rows = [{**e["address"], "parcel_id": e["parcel_id"], "property_class": e["property_class_original"],
             "agency_record_id": e["agency_record_id"], "case_number": e["case_number"],
             "violation_description": e["description"], "violation_date": e["violation_date"],
             "snapshot_finished_at": e["collected_at"], "source_content_hash": e["original_sha256"]} for e in events]
    require(not candidate_reasons(rows, p["identity_observations"], p["identity_observations"]), "Uncertain identity/classification")
    return p


def prepare(prepared, snapshot, output):
    output = Path(output)
    require(not (output / "selection.json").exists(), "Preparation exists; verify/reuse it instead of overwriting")
    at = now()
    manifest, rows, raw = load_retained(prepared)
    by_parcel, by_address, observed_events = build_snapshot_index(snapshot, set(raw))
    require(all(k in observed_events and same_agency_record(v["source_record"], observed_events[k]) for k, v in raw.items()),
            "Selected originals do not reconcile to full snapshot")
    groups, business = collections.defaultdict(list), collections.defaultdict(set)
    for r in raw.values():
        business[business_key(r["source_record"])].add(str(r["source_record"]["uniquekey"]))
    duplicates = set().union(*(v for v in business.values() if len(v) > 1))
    for row in rows:
        groups[row["parcel_id"]].append(row)
    candidates, holds = [], []
    for parcel, rr in sorted(groups.items()):
        observations = by_parcel.get(parcel, [])
        reasons = candidate_reasons(rr, observations, by_address.get(address_key(rr[0]), []))
        if any(r["agency_record_id"] in duplicates for r in rr):
            reasons.append("possible_duplicate_event")
        if reasons:
            holds.append({"parcel_id": parcel, "address": original_address(rr[0]), "reasons": reasons,
                "next_action": "Use an official Buffalo assessor/property source for identity or classification conflicts; preserve hold."})
        else:
            candidates.append(rr)
    # Deliberate small benchmark, not a deal ranking: 4 one-family, 4 two-family,
    # 2 three-family. Include a multi-case and a single-record item where available.
    selected = []
    for code, quota in (("210", 4), ("220", 4), ("230", 2)):
        pool = [rr for rr in candidates if rr[0]["property_class"] == code and len(rr) <= 8]
        require(len(pool) >= quota, "Insufficient unambiguous candidates for class " + code)
        complex_item = min(pool, key=lambda rr: (-len({r["case_number"] for r in rr}), -len(rr), rr[0]["parcel_id"]))
        simple_item = min(pool, key=lambda rr: (len(rr), rr[0]["parcel_id"]))
        chosen = [complex_item]
        if simple_item is not complex_item and len(chosen) < quota:
            chosen.append(simple_item)
        for rr in sorted(pool, key=lambda rr: (-len({r["violation_description"] for r in rr}), rr[0]["parcel_id"])):
            if rr not in chosen and len(chosen) < quota:
                chosen.append(rr)
        selected.extend(chosen)
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    entries = []
    for rr in selected:
        parcel = rr[0]["parcel_id"]
        p = build_package(rr, observed_events, by_parcel[parcel], at)
        validate_package(p)
        folder = output / "properties" / parcel
        write_json(folder / "evidence.json", p)
        originals = {r["agency_record_id"]: source_fields(raw[r["agency_record_id"]]["source_record"]) for r in rr}
        write_json(folder / "originals.json", originals)
        write_json(folder / "agency_originals.json", {r["agency_record_id"]: observed_events[r["agency_record_id"]] for r in rr})
        write_json(folder / "cleaned_source_rows.json", rr)
        entries.append({"parcel_id": parcel, "property_key": p["property_key"], "address": p["address"],
            "input_sha256": p["input_sha256"], "evidence_file_sha256": file_hash(folder / "evidence.json"),
            "originals_file_sha256": file_hash(folder / "originals.json"),
            "agency_originals_file_sha256": file_hash(folder / "agency_originals.json"),
            "cleaned_source_rows_file_sha256": file_hash(folder / "cleaned_source_rows.json"),
            "evidence_review": "pending", "draft_review": "not_generated"})
    shutil.copyfile(Path(prepared) / "batch_manifest.json", output / "retained_batch_manifest.json")
    write_json(output / "held_candidates.json", holds)
    selection = {"version": VERSION, "prepared_at": at, "scope": "ten_buffalo_properties_private_local_only",
        "source_batch": {"violations": 984, "cases": 322, "complete_addresses": 307, "parcel_references": 376},
        "full_snapshot_rows_checked": 257696, "full_snapshot_sha256": FULL_SNAPSHOT_SHA,
        "unambiguous_candidate_count": len(candidates), "held_parcel_group_count": len(holds),
        "held_original_event_ids": sorted(HELD_IDS), "properties": entries,
        "model_runs": 0, "model_quality": "unmeasured", "mac_performance": "unmeasured"}
    write_json(output / "selection.json", selection)
    return selection


def load_packages(output):
    output = Path(output)
    selection = read_json(output / "selection.json")
    require(len(selection["properties"]) == 10 and len({x["parcel_id"] for x in selection["properties"]}) == 10,
            "Pilot requires exactly ten distinct parcels")
    packages = []
    for entry in selection["properties"]:
        require(re.fullmatch(r"\d{16}", entry["parcel_id"]) is not None, "Unsafe parcel path")
        folder = output / "properties" / entry["parcel_id"]
        for name, key in (("evidence.json", "evidence_file_sha256"), ("originals.json", "originals_file_sha256"),
                          ("agency_originals.json", "agency_originals_file_sha256"),
                          ("cleaned_source_rows.json", "cleaned_source_rows_file_sha256")):
            require(file_hash(folder / name) == entry[key], "Evidence companion changed: " + name)
        p = validate_package(read_json(folder / "evidence.json"))
        require(entry["property_key"] == p["property_key"] and entry["input_sha256"] == p["input_sha256"], "Selection mismatch")
        originals = read_json(folder / "originals.json")
        agency_originals = read_json(folder / "agency_originals.json")
        require(len(originals) == len(p["events"]) and len({business_key(r) for r in originals.values()}) == len(originals),
                "Duplicate business event or unlinked original")
        cleaned = {r["agency_record_id"]: r for r in read_json(folder / "cleaned_source_rows.json")}
        require(set(cleaned) == set(originals), "Cleaned companion identities changed")
        for e in p["events"]:
            r = originals[e["agency_record_id"]]
            agency_original = agency_originals[e["agency_record_id"]]
            require(digest(agency_original) == e["agency_json_sha256"] and same_agency_record(r, agency_original),
                    "Agency JSON and prepared CSV representations conflict")
            c = cleaned[e["agency_record_id"]]
            require(digest(r) == e["original_sha256"] and str(r["sbl"]) == p["parcel_id"] and
                    str(r["propclass"]) == e["property_class_original"] and address_key(r) == address_key(p["address"]),
                    "Original record mismatch")
            require(e["source_date_raw"] == r["date"] and e["violation_date"] == r["date"][:10] and
                    e["status_as_collected"] == r["status"] and e["case_number"] == r["case_number"] and
                    e["code"] == r["code"] and e["code_section"] == r["code_section"] and
                    e["description"] == redact(c["violation_description"]) and e["comments"] == redact(c["comments"]) and
                    e["violation_location"] == redact(c["violation_location"]), "Event content does not reconcile to retained companions")
        packages.append(p)
    return packages
