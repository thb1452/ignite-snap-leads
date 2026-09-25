import copy
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "runtime"))
from market_validation import CHECKS, expected_row, sample_plan, validate
from record_privacy import MADISON_VERSION, clean_madison, sha
from test_record_privacy import fixture


def setup(cases=None):
    raw = fixture(cases)
    context = dict(agency_key="us:mi:madisonheights", adapter_version=MADISON_VERSION,
                   receipt_id="fixture-receipt", request_id="fixture-request", original_sha256=sha(raw),
                   period_start="2026-08-23", period_end="2026-09-20", archive_id="fixture-archive",
                   archive_manifest_sha256="a" * 64, archive_verified=True,
                   binding_evidence_ref="fixture-bound-request", freshness_policy_ref="fixture-policy",
                   isolation_test_receipt="fixture-isolation", refresh_preservation_receipt="fixture-refresh")
    report = clean_madison(raw, agency_key=context["agency_key"], expected_agency_key=context["agency_key"],
                           request_id=context["request_id"], receipt_id=context["receipt_id"],
                           period_start=context["period_start"], period_end=context["period_end"])
    context.update(original_row_count=report["input_records"], passing_row_count=report["passed_records"])
    stored = [expected_row(r, context, report["report_date"]) for r in report["records"] if r["accuracy_status"] == "passed"]
    reviews = [dict(review_id=r["review_id"], source_rows=r["source_rows"],
                    disposition="verified_for_owner_review" if r["disposition"] == "passed" else "keep_held",
                    reviewer="fixture-reviewer", reviewed_at="2026-09-24", evidence_ref="fixture-source-check",
                    **{check: "pass" for check in CHECKS}) for r in sample_plan(report["records"])]
    return raw, context, stored, reviews


class MarketValidationTests(unittest.TestCase):
    def test_ready_never_means_publication_authorized(self):
        result = validate(*setup())
        self.assertEqual(result["status"], "READY_FOR_OWNER_REVIEW")
        self.assertFalse(result["customer_release_authorized"])
        self.assertEqual((result["writes"], result["network_calls"]), (0, 0))

    def test_missing_or_tampered_original_holds(self):
        raw, context, stored, reviews = setup()
        self.assertIn("original_bytes_unavailable", validate(None, context, stored, reviews)["blockers"])
        self.assertIn("original_hash_mismatch", validate(raw + b"\n", context, stored, reviews)["blockers"])

    def test_source_scope_cannot_be_substituted(self):
        raw, context, stored, reviews = setup()
        context["agency_key"] = "us:wi:madison"
        self.assertIn("unreviewed_agency_or_adapter", validate(raw, context, stored, reviews)["blockers"])

    def test_semantic_mutation_detected_even_when_counts_equal(self):
        raw, context, stored, reviews = setup()
        for field, changed in [("source_status", "COMPLIED"), ("filed_date", "2026-09-02"),
                               ("city", "Madison"), ("source_parcel_reference", "44-00-00-000-000"),
                               ("cleaned_description", "Tenant Jane PRIVATE 555-1212"),
                               ("source_row_sha256", "b" * 64)]:
            with self.subTest(field=field):
                altered = copy.deepcopy(stored)
                altered[0][field] = changed
                result = validate(raw, context, altered, reviews)
                self.assertIn("original_to_import_mismatch", result["blockers"])
                self.assertNotIn("Tenant Jane", json.dumps(result))
                self.assertNotIn("123 FIXTURE ST", json.dumps(result))

    def test_missing_extra_or_duplicate_stored_cases_hold(self):
        raw, context, stored, reviews = setup()
        for altered in [[], stored + [dict(stored[0], record_key="extra")], stored + stored]:
            result = validate(raw, context, altered, reviews)
            self.assertEqual(result["status"], "HOLD")

    def test_automated_comparison_does_not_replace_manual_review(self):
        raw, context, stored, reviews = setup()
        result = validate(raw, context, stored)
        self.assertIn("manual_original_review_incomplete_or_failed", result["blockers"])
        reviews[0]["identity"] = "fail"
        self.assertEqual(validate(raw, context, stored, reviews)["status"], "HOLD")

    def test_exception_cannot_borrow_duplicate_approval(self):
        case = ["E26-00001", "123 FIXTURE ST", "WEEDS", "09/01/2026", "VIOLATION", "", "", ""]
        raw, context, stored, reviews = setup([case, case])
        self.assertEqual(validate(raw, context, stored, reviews)["status"], "READY_FOR_OWNER_REVIEW")
        result = validate(raw, context, stored, reviews[:1])
        self.assertEqual(result["counts"]["sampled_exceptions"], 1)
        self.assertEqual(result["status"], "HOLD")

    def test_sample_floors_status_strata_all_exceptions_and_determinism(self):
        cases = []
        for number in range(140):
            status = "VIOLATION" if number < 70 else "COMPLIED"
            cases.append([f"E26-{number:05}", f"{number + 100} FIXTURE ST", "WEEDS", "09/01/2026", status, "", "", "09/02/2026" if status == "COMPLIED" else ""])
        cases.append(["E26-00999", "999 FIXTURE ST", "WEEDS", "09/01/2026", "UNREVIEWED", "", "", ""])
        args = setup(cases)
        result = validate(*args)
        self.assertEqual(result["counts"]["sampled_passing_cases"], 60)
        self.assertEqual(result["counts"]["sampled_exceptions"], 1)
        self.assertEqual(result["sample"], validate(*args)["sample"])
        for status in ("VIOLATION", "COMPLIED"):
            self.assertEqual(sum(row["source_status"] == status for row in result["sample"]), 30)

    def test_receipt_accounting_and_dependency_receipts_are_required(self):
        raw, context, stored, reviews = setup()
        context["original_row_count"] += 1
        context.pop("freshness_policy_ref")
        context.pop("isolation_test_receipt")
        context["archive_verified"] = False
        result = validate(raw, context, stored, reviews)
        self.assertTrue({"receipt_counts_mismatch", "freshness_cadence_unverified", "customer_isolation_unverified", "archive_or_request_binding_not_verified"}.issubset(result["blockers"]))

    def test_report_filter_cannot_certify_missing_request_days(self):
        for field, value in (("period_start", "2026-08-22"), ("period_end", "2026-09-24")):
            with self.subTest(field=field):
                raw, context, stored, reviews = setup()
                context[field] = value
                result = validate(raw, context, stored, reviews)
                self.assertIn("source_report_does_not_cover_request_period", result["blockers"])
                self.assertEqual(result["status"], "HOLD")
                self.assertEqual(result["mismatches"], [])


if __name__ == "__main__":
    unittest.main()
