

## Plan: Fix Future Dates in Violation Data

### Problem
98 violations have `opened_date` values in the future (2026-2029), likely compliance deadlines or expiration dates from CSV imports that were incorrectly mapped as violation open dates. These bubble up to `newest_violation_date` on properties, breaking the "Newest Violations" sort.

### Root Cause
The `sanitizeDateString` function in `process-upload` accepts dates up to year 2100. It should cap at today's date for violation `opened_date` fields, since a violation cannot have been opened in the future.

### Changes

**1. Fix existing bad data (SQL data update)**
- Cap all `violations.opened_date` values that are in the future to today's date
- Cap all `properties.newest_violation_date` values that are in the future to today's date

**2. Harden the ingestion pipeline (`supabase/functions/process-upload/index.ts`)**
- Update `sanitizeDateString` to reject dates more than 30 days in the future (small buffer for timezone edge cases), returning `null` instead
- Change the year upper bound from 2100 to `current year + 1` as a secondary safeguard

**3. Harden the aggregation logic (`supabase/functions/generate-insights/index.ts`)**
- When computing `newest_violation_date`, filter out any `opened_date` values that are in the future before taking the max

### Scope
- 98 violations affected
- 98 properties affected  
- 2 edge function files edited
- 1 data fix query

