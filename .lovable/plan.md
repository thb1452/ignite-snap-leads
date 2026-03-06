

## Plan: Enhance FOIA Import to Support Your VA Tracking Sheets

Your three CSVs contain not just target jurisdiction info, but also contact emails, submission methods, request statuses, dates, and notes — all critical context for VAs. The current ImportWizard only imports basic target data into the `targets` table and loses this history. Here is the plan to fix that.

### What the CSVs contain beyond current support

| Field | Water Shutoff | MASTER_SHEET | 2K_MASTER |
|-------|--------------|--------------|-----------|
| Contact email | FOIA_Email | Contact Value | Contact Value |
| Submission method | Method | Submission Method | Submission Method |
| Request status | Status | Status (2nd col) | Status (2nd col) |
| Request date | Date Requested | Date | Date Submitted |
| Notes | Notes | Notes (2nd col) | Notes (2nd col) |

### Changes

**1. Database migration — add columns to `targets` table**
- `contact_email text` — store the clerk email or contact value
- `submission_method text` — email, portal, pdf_form, manual, etc.
- `notes text` — general notes from the sheet

**2. Enhance ImportWizard column mapping**
- Add mappings for: Contact Email, Submission Method, Notes, Request Status, Request Date
- Auto-detect these columns from CSV headers (e.g., "FOIA_Email" or "Contact Value" maps to contact_email)
- Each CSV has slightly different headers; the auto-detect logic handles all three formats

**3. Seed `foia_requests` for rows with existing status/date**
- After inserting targets, for any row that has a status and date, create a corresponding `foia_requests` record linked to that target
- Map CSV statuses ("Sent", "Fulfilled", "Fee Quote", "Already Sent") to the system's status enum (sent, fulfilled, needs_review, sent)
- This preserves historical request tracking so VAs see what has already been done

**4. File-level target type auto-detection**
- Water_Shut_Off_Sheet defaults to `water_shutoff` target type
- MASTER_SHEET and 2K_MASTER_SHEET default to `city_foia` (with county rows detected by name containing "County")

### Files modified
- `supabase/migrations/` — new migration adding 3 columns to targets
- `src/components/foia/admin/ImportWizard.tsx` — expanded column mapping, status seeding logic, auto-detect improvements
- `src/types/foia.ts` — update `ColumnMapping` and `Target` types with new fields

