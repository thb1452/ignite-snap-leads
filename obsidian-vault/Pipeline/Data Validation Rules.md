# ✅ Data Validation Rules

> Bad data is worse than no data. Every batch passes these checks before Supabase upload.

---

## Required Fields (Code Violations)
- [ ] Property address (not empty, not "N/A")
- [ ] Violation type or code reference
- [ ] Date (violation, complaint, or inspection)
- [ ] Status (open / closed / resolved)

## Required Fields (Water Shutoffs)
- [ ] Property address
- [ ] Shutoff date
- [ ] Reason (if available)

---

## Cleaning Steps
1. **Remove junk rows** — headers repeated mid-file, blank rows, test entries
2. **Normalize addresses** — consistent format: `123 Main St, City, ST 00000`
3. **Standardize violation types** — map local codes to Snap Ignite categories
4. **Format dates** — ISO 8601: `YYYY-MM-DD`
5. **Deduplicate** — flag exact address+date+type duplicates
6. **Reject threshold** — if >30% of rows fail validation, flag batch for manual review before upload

---

## Upload Gate
- All required fields populated ✅
- Rejection rate <30% ✅
- JR approval not required for clean batches
- JR approval **required** if rejection rate >30% or data looks anomalous

---

## Quality Score (1–10)
| Score | Meaning |
|---|---|
| 9–10 | Clean, complete, ready |
| 7–8 | Minor gaps, still usable |
| 5–6 | Significant cleaning needed |
| 1–4 | Partial or unreliable — flag before upload |
