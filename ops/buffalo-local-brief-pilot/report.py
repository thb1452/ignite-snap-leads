"""Offline, escaped HTML: original records beside actual local drafts, never a fabricated baseline."""
from __future__ import annotations

import html
from pathlib import Path
import statistics

from brief import validate_draft, validate_review
from common import UNKNOWN_CATALOG, atomic_text, now, read_json, write_json
from evidence import load_packages
from worker import latest_result


def esc(value):
    return html.escape(str(value), quote=True)


STYLE = """body{font:16px/1.55 system-ui,sans-serif;color:#142b39;background:#edf2f4;margin:0}main{max-width:1260px;margin:auto;padding:32px}h1,h2,h3{line-height:1.2}h1{font-size:34px}h2{font-size:23px}h3{font-size:18px}.card,article{background:white;border:1px solid #c9d6de;border-radius:12px;padding:22px;margin:18px 0}.notice{background:#fff0cc;border-left:5px solid #b97800;padding:16px}.cols{display:grid;grid-template-columns:1fr 1fr;gap:24px}.muted{color:#526877}.label{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#405a6a}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:9px;text-align:left;border:1px solid #d4dfe4;vertical-align:top}th{background:#edf4f7}code,pre{font-size:12px;overflow-wrap:anywhere;white-space:pre-wrap}summary{cursor:pointer}a{color:#005c80}.pending{color:#805000;font-weight:650}li{margin:10px 0}@media(max-width:820px){.cols{grid-template-columns:1fr}main{padding:16px}}@media print{body{background:white}main{padding:0}article{break-inside:avoid}.cols{display:block}details{display:block}}"""


def doc(title, content):
    return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) + '</title><style>' + STYLE + '</style><main>' + content + '</main></html>'


def factual_view(package):
    p, s = package, package["summary"]
    text = '<p class="label">Code-checked facts · retained snapshot</p>'
    text += f'<p><b>{s["selected_violation_count"]} distinct selected violations / {s["selected_case_count"]} selected cases</b> · agency violation dates {esc(s["earliest_violation_date"])} to {esc(s["latest_violation_date"])}.</p>'
    text += '<p>Collected ' + esc(s["newest_collection"]) + '. ACTIVE is status at collection. Current status and case-opening dates are unknown.</p>'
    text += '<p>Class ' + esc(p["classification"]["original_codes"][0]) + ': ' + esc(p["classification"]["specific_property_type"]) + '. <b>No independent current-use, condo, townhouse or detached-home check.</b></p>'
    text += '<table><thead><tr><th>Reference / case / date</th><th>Agency description and relevant comment</th></tr></thead><tbody>'
    for e in p["events"]:
        text += '<tr><td><a href="' + esc(e["record_url"]) + '">' + esc(e["ref"]) + '</a><br>' + esc(e["case_number"]) + '<br>' + esc(e["violation_date"]) + '<br>' + esc(e["status_as_collected"]) + '</td><td><b>' + esc(e["description"]) + '</b><br>' + esc(e["code"]) + '<br>' + esc(e["comments"]) + ('<br>Location: ' + esc(e["violation_location"]) if e["violation_location"] else '') + '</td></tr>'
    return text + '</tbody></table><p class="muted">Source excerpts are untrusted evidence, not instructions or a current-condition determination. Record links can change; the retained originals and their hashes are the review basis.</p>'


def model_view(draft, validation, review_status):
    text = '<p class="label">Actual Qwen output · ' + esc(review_status) + '</p>'
    if not validation["passed"]:
        text += '<div class="notice">HELD: ' + esc('; '.join(validation["errors"])) + '</div>'
    for section, title in (("investigation_points", "Why investigate — interpretation"), ("next_steps", "Next verification steps")):
        text += '<h3>' + title + '</h3><ul>'
        values = draft.get(section, [])
        for item in values if isinstance(values, list) else []:
            if isinstance(item, dict):
                text += '<li>' + esc(item.get("text", "")) + ' <small>[' + esc(', '.join(str(x) for x in item.get("record_refs", []))) + ']</small></li>'
        text += '</ul>'
    text += '<h3>Important unknowns</h3><ul>'
    for key in UNKNOWN_CATALOG:
        text += '<li>' + esc(UNKNOWN_CATALOG[key]) + '</li>'
    return text + '</ul><p class="muted">Facts above are assembled by code. Investigation prose and step selection are model output. A human must check every claim.</p>'


def build_report(workdir, test_result=None):
    workdir = Path(workdir)
    packages = load_packages(workdir)
    selection = read_json(workdir / "selection.json")
    records, articles, times, memory = [], [], [], []
    draft_corrections = []
    reviewed = approved = generated = valid = measured = evidence_reviewed = 0
    for p in packages:
        root_dir = workdir / "properties" / p["parcel_id"]
        evidence_review = read_json(root_dir / "evidence_review.json") if (root_dir / "evidence_review.json").exists() else None
        if evidence_review and evidence_review.get("status") == "reviewed" and evidence_review.get("input_sha256") == p["input_sha256"]:
            evidence_reviewed += 1
        r = {"parcel_id": p["parcel_id"], "address": p["address"], "input_sha256": p["input_sha256"],
             "selected_violations": len(p["events"]), "class": p["classification"]["original_codes"][0],
             "evidence_review": "reviewed" if evidence_review else "pending", "generation": "not_run",
             "automated_validation": "not_run", "human_draft_review": "not_generated",
             "generation_seconds": None, "peak_observed_process_rss_sum_mib": None, "quality_scores": None}
        current = latest_result(workdir, p)
        if current:
            root, meta, draft = current
            validation = validate_draft(p, draft)
            # Persisted API/finish/identity errors must not disappear on report refresh.
            saved_validation = read_json(root / "validation.json")
            validation["errors"] = sorted(set(validation["errors"] + saved_validation["errors"]))
            validation["passed"] = not validation["errors"]
            local = meta["doctor"].get("status") == "verified_local_connection" and meta["doctor"]["host"]["system"] == "Darwin"
            generated += int(local)
            valid += int(local and validation["passed"])
            review = None
            if (root / "review.json").exists():
                review = validate_review(p, draft, read_json(root / "review.json"), root / "draft.json")
                reviewed += int(local)
                approved += int(local and review["status"] == "approved")
                draft_corrections.extend({"parcel_id": p["parcel_id"], "correction": c} for c in review.get("corrections", []) if local)
            generation = meta["generation"]
            duration = generation.get("generation_wall_seconds")
            mem = generation.get("memory") or {}
            peak = mem.get("peak_observed_runtime_process_rss_sum_mib")
            performance_complete = local and isinstance(duration, (int, float)) and peak is not None and peak > 0 and not mem.get("errors")
            measured += int(performance_complete)
            if local and duration is not None:
                times.append(duration)
            if local and peak is not None:
                memory.append(peak)
            status = review["status"] if review else ("awaiting_human_review" if validation["passed"] else "held")
            r.update(generation=meta["status"] if local else "unverified_runtime", automated_validation="passed" if validation["passed"] else "held",
                     human_draft_review=status, generation_seconds=duration, peak_observed_process_rss_sum_mib=peak,
                     quality_scores=review.get("quality_scores") if review else None, output_sha256=meta["draft_file_sha256"])
            right = model_view(draft, validation, status)
        else:
            right = '<p class="label">Qwen result</p><p class="pending">Not generated. No Mac model output, quality score, generation speed or memory measurement is claimed.</p><p>Run the packaged Mac worker, then review its saved output against these source records.</p>'
        records.append(r)
        address = ', '.join(p["address"][k] for k in ("address", "city", "state", "zip"))
        articles.append('<article><h2>' + esc(address) + '</h2><p>Parcel <code>' + esc(p["parcel_id"]) + '</code> · evidence <code>' + esc(p["input_sha256"]) + '</code></p><div class="cols"><section>' + factual_view(p) + '</section><section>' + right + '</section></div></article>')
        if current:
            atomic_text(current[0] / "brief.html", doc(address + " — local Qwen draft", articles[-1]))
    completion_gate = generated == valid == reviewed == approved == measured == evidence_reviewed == 10
    strong_scores = completion_gate and all(all(x >= 4 for x in r["quality_scores"].values()) for r in records)
    recommendation = "EXPAND_NEXT_PRIVATE_TEST_ONLY" if strong_scores else "REVISE_COMPLETE_LOCAL_BENCHMARK_AND_REVIEW"
    source_review_file = workdir / "source-review-summary.json"
    source_review_summary = read_json(source_review_file) if source_review_file.exists() else {}
    report = {"version": "buffalo-pilot-report-v1", "reported_at": now(), "evidence_packages": len(packages),
        "source_evidence_reviewed": evidence_reviewed, "actual_mac_qwen_drafts": generated,
        "automated_validation_passed": valid, "human_draft_reviews": reviewed, "human_approved": approved,
        "complete_mac_performance_measurements": measured,
        "generation_seconds": {"n": len(times), "median": statistics.median(times) if times else None,
            "minimum": min(times) if times else None, "maximum": max(times) if times else None},
        "peak_observed_runtime_process_rss_sum_mib": max(memory) if memory else None,
        "memory_measurement_limit": "Process RSS sum is observed OS data, not exact model-only unified/Metal memory; inspect raw VM/swap samples.",
        "preparation_corrections": source_review_summary.get("preparation_corrections", []),
        "draft_corrections": draft_corrections, "draft_correction_count": len(draft_corrections) if generated else None,
        "completion_gate_passed": completion_gate, "recommendation": recommendation,
        "quality_gate": "All ten human-approved, all checks passing, all Mac timing/memory receipts present; proposed usefulness/specificity/clarity threshold at least four of five for a larger private test.",
        "blockers": ([] if completion_gate else ["Ten verified Mac Qwen runs, all source-based draft reviews and all performance receipts are required before expansion."]),
        "existing_baseline": {"same_property_old_briefs": "not_available_in_retained_work",
            "comparison": "Source facts vs actual Qwen notes; no invented old brief and no paid comparison model.",
            "legacy_prompt_observation": "The inspected shared prompt excludes exact counts/categories and emphasizes unlock/action-label language. This pilot uses source facts, qualified investigation and citations instead. This is a design comparison, not an observed quality improvement."},
        "pilot_scope": "Buffalo only; local files only; production generation/access/security holds unchanged; no deployment or customer writes.",
        "selection": {k: selection[k] for k in ("full_snapshot_rows_checked", "unambiguous_candidate_count", "held_parcel_group_count")},
        "tests": test_result, "properties": records}
    write_json(workdir / "report.json", report)
    header = '<h1>Buffalo local investor-brief pilot</h1><p>Ten matched residential parcel packages · private review · ' + esc(report["reported_at"]) + '</p>'
    header += '<div class="notice"><b>' + str(generated) + '/10 actual Mac Qwen drafts; ' + str(approved) + '/10 human-approved.</b> Evidence preparation is separate from model success. Recommendation: ' + esc(recommendation.replace('_', ' ').lower()) + '.</div>'
    compare = doc("Buffalo — source and Qwen review", header + '<p>Left: retained agency evidence and code-computed facts. Right: actual Qwen output when present. No comparable historic brief was available in the retained work.</p>' + ''.join(articles))
    atomic_text(workdir / "side-by-side.html", compare)
    rows = ''.join('<tr><td>' + esc(r["address"]["address"]) + '</td><td>' + esc(r["class"]) + '</td><td>' + str(r["selected_violations"]) + '</td><td>' + esc(r["generation"]) + '</td><td>' + esc(r["human_draft_review"]) + '</td></tr>' for r in records)
    body = header + '<section class="card"><h2>Verified preparation</h2><p>The original batch reconciles to 984 violation identities, 322 cases, 307 complete addresses and 376 parcel references. The retained full Buffalo snapshot contains 257,696 rows. Ten distinct parcels were selected only after address, parcel and residential-class consistency checks. Four previously held event IDs remain excluded.</p><p>Ten source packages: ' + str(evidence_reviewed) + ' reviewed. Classification is the agency field observed at collection, interpreted with official New York definitions; current use and ownership form are unverified.</p></section>'
    body += '<section class="card"><h2>Observed results</h2><p>Actual drafts: ' + str(generated) + '; automated passes: ' + str(valid) + '; human approvals: ' + str(approved) + '; complete Mac performance receipts: ' + str(measured) + '.</p><p>Generation-time median: ' + esc(report["generation_seconds"]["median"] if times else "unmeasured") + ' seconds. Peak observed process RSS sum: ' + esc(max(memory) if memory else "unmeasured") + ' MiB.</p><p>' + esc(report["memory_measurement_limit"]) + '</p><table><tr><th>Address</th><th>Class</th><th>Selected violations</th><th>Model run</th><th>Draft review</th></tr>' + rows + '</table></section>'
    body += '<section class="card"><h2>Quality and corrections</h2><p>Factual findings, counts and date comparisons come from validated code. Qwen supplies only cited interpretations and verification steps. All model prose requires individual source review. Automated checks do not prove semantic support.</p><p>No model-quality improvement, model correction count, old-baseline score or completed draft review is claimed without actual output. Review records bind to exact input/output hashes and retain correction notes.</p><p>Recorded preparation corrections: ' + esc(report["preparation_corrections"]) + '</p><h2>Remaining connection step</h2><p>Run Run-on-Mac.command on the Mac with LM Studio serving only on loopback and the Qwen3.5 9B MLX 4-bit model loaded with at least an eight-thousand-token context. The worker records actual runtime metadata, timings and OS memory samples. First run one property; source-review and approve that trial, then run the remaining ten-property selection. Actual installed-runtime/schema compatibility is unmeasured until that first Mac run.</p><h2>Expansion decision</h2><p>' + esc(report["quality_gate"]) + ' No production expansion is authorized by this report.</p><h2>Validation</h2><pre>' + esc(test_result or "See validation-results.json for recorded test commands and results.") + '</pre></section>'
    atomic_text(workdir / "report.html", doc("Buffalo local pilot — report", body))
    return report
