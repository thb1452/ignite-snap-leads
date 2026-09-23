# City response processing

Extends the existing Hermes matcher with independently versioned mixed-message classification. The classifier does not authorize sending. The receipt matching contract remains compatible with v1.

The source-specific Madison Heights reader accounts for report headers, case rows, parcel continuation rows and footers. It generates descriptions only from reviewed closed-vocabulary fields. Unstructured narratives and changed layouts remain in review; originals are not modified. Cleaned evidence cannot fall back to legacy raw descriptions.

Run `python3 -m unittest discover -s ops/city-response/tests -v` from the repository root. Fixtures use synthetic names and addresses.

These are staged components of an incomplete integration. Automatic reply authorization, guarded Snap import and end-to-end deployment verification are still required. Existing insight containment remains active. Do not infer production readiness from these files or tests.
