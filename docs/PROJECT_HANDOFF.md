# Snap Ignite - Project Handoff Document

**Generated:** December 2024  
**Project:** Snap Ignite - Code Violation Lead Management Platform

---

## Table of Contents
1. [Tech Stack & Architecture](#tech-stack--architecture)
2. [Database Schema](#database-schema)
3. [Core Features](#core-features)
4. [Edge Functions](#edge-functions)
5. [Known Issues & Bugs](#known-issues--bugs)
6. [Recent Changes](#recent-changes)
7. [Pain Points & Fragile Areas](#pain-points--fragile-areas)
8. [Environment & Configuration](#environment--configuration)
9. [Bug/Issue Report](#bugissue-report)

---

## Tech Stack & Architecture

### Frontend
- **Framework:** React 18.3 with TypeScript
- **Build Tool:** Vite
- **Styling:** Tailwind CSS with custom design system (HSL-based tokens)
- **UI Components:** shadcn/ui (Radix UI primitives)
- **State Management:** TanStack React Query v5
- **Routing:** React Router DOM v6
- **Forms:** React Hook Form + Zod validation
- **Animations:** Framer Motion
- **Maps:** Leaflet + React Leaflet with MarkerCluster
- **CSV Parsing:** PapaParse

### Backend (Lovable Cloud / Supabase)
- **Database:** PostgreSQL with PostGIS extension
- **Auth:** Supabase Auth with role-based access (admin, va, user)
- **Edge Functions:** Deno runtime (15 functions deployed)
- **Storage:** Supabase Storage (for CSV uploads)
- **Real-time:** Supabase Realtime (for job progress)

### External APIs
- **BatchData API:** Skip tracing (owner contact lookup)
- **Mapbox Geocoding:** Address-to-coordinates conversion
- **Stripe:** Subscription billing

### Architecture Diagram
```
┌─────────────────────────────────────────────────────────────┐
│                    React Frontend (Vite)                     │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐ │
│  │ Upload  │  │  Leads  │  │  Lists  │  │  Admin Console  │ │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────────┬────────┘ │
└───────┼────────────┼───────────┼─────────────────┼──────────┘
        │            │           │                 │
        ▼            ▼           ▼                 ▼
┌─────────────────────────────────────────────────────────────┐
│                    Supabase Client                           │
│              (RLS-protected queries)                         │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Edge Functions│    │   Database   │    │   Storage    │
│ (Deno)       │    │  (Postgres)  │    │  (S3-like)   │
│              │    │              │    │              │
│ • process-   │    │ • properties │    │ • csv-       │
│   upload     │    │ • violations │    │   uploads    │
│ • geocode    │    │ • upload_jobs│    │              │
│ • skiptrace  │    │ • contacts   │    │              │
│ • export-csv │    │ • lead_lists │    │              │
└──────┬───────┘    └──────────────┘    └──────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│          External APIs               │
│  • BatchData (skip tracing)          │
│  • Mapbox (geocoding)                │
│  • Stripe (billing)                  │
└──────────────────────────────────────┘
```

---

## Database Schema

### Core Tables

#### `properties` - Main property/lead table
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| address | text | Street address (UPPERCASE normalized) |
| city | text | City name |
| state | text | 2-letter state code |
| zip | text | ZIP code |
| county | text | County name (for county-scope uploads) |
| latitude/longitude | numeric | Geocoded coordinates |
| snap_score | integer | AI-generated distress score (0-100) |
| snap_insight | text | AI-generated property analysis |
| total_violations | integer | Total violation count |
| open_violations | integer | Currently open violations |
| oldest_violation_date | date | Date of first violation |
| newest_violation_date | date | Date of most recent violation |
| distress_signals | text[] | Array of distress indicators |
| opportunity_class | text | 'watch', 'rising', 'prime', etc. |
| jurisdiction_id | uuid | FK to jurisdictions table |
| scope | text | 'city' or 'county' |

**Unique Index:** `idx_properties_unique_address` on `(LOWER(TRIM(address)), LOWER(TRIM(city)), LOWER(TRIM(state)), LOWER(TRIM(zip)))`  
⚠️ **CRITICAL:** This is a functional index - Supabase `upsert` with `onConflict` cannot use it!

#### `violations` - Individual code violations
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| property_id | uuid | FK to properties |
| violation_type | text | Category (e.g., "WEEDS", "DEBRIS") |
| description | text | Violation description |
| status | text | 'Open', 'Closed', etc. |
| opened_date | date | When violation was opened |
| days_open | integer | Calculated days open |
| case_id | text | Original case/ticket number |

#### `upload_jobs` - CSV upload tracking
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Uploading user |
| filename | text | Original filename |
| storage_path | text | Path in Supabase storage |
| status | text | QUEUED, PROCESSING, DEDUPING, SCORING, COMPLETE, FAILED |
| city/county/state | text | Location metadata |
| scope | text | 'city' or 'county' |
| total_rows | integer | Total CSV rows |
| processed_rows | integer | Progress counter |
| properties_created | integer | New properties made |
| violations_created | integer | New violations made |
| error_message | text | Error details if failed |

#### `upload_staging` - Temporary parsed CSV data
| Column | Type | Description |
|--------|------|-------------|
| job_id | uuid | FK to upload_jobs |
| row_num | integer | Original CSV row |
| address | text | Parsed address |
| violation | text | Parsed violation type |
| status | text | Violation status |
| opened_date | date | Parsed date |
| processed | boolean | Whether converted to property/violation |
| error | text | Row-level error if any |

#### `property_contacts` - Skip trace results
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| property_id | uuid | FK to properties |
| name | text | Owner name |
| phone | text | Phone number (E.164 format) |
| email | text | Email address |
| source | text | 'batchdata', 'manual', etc. |
| raw_payload | jsonb | Full API response |
| created_by | uuid | User who ran skip trace |

#### `lead_lists` - User-created property lists
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Owner |
| name | text | List name |

#### `list_properties` - Many-to-many for lists
| Column | Type | Description |
|--------|------|-------------|
| list_id | uuid | FK to lead_lists |
| property_id | uuid | FK to properties |
| created_by | uuid | Who added it |

### User/Auth Tables

#### `user_roles` - Role-based access control
- Roles: `admin`, `va` (virtual assistant), `user`
- Checked via `has_role(user_id, role)` function

#### `user_profiles` - User metadata
- `credits` - Skip trace credit balance
- `consented_skiptrace` - FCRA consent flag

#### `profiles` - Organization membership
- Links users to organizations
- `org_id` FK to organizations

### Job Tables

#### `geocoding_jobs` - Background geocoding
#### `skiptrace_jobs` - Bulk skip trace jobs
#### `skiptrace_bulk_runs` / `skiptrace_bulk_items` - List-based skip tracing

### Views

- `v_hot_properties` - High-score distressed properties
- `v_jurisdiction_stats` - Stats by jurisdiction
- `v_opportunity_funnel` - Properties by opportunity class
- `v_user_credits` - User credit balances

---

## Core Features

### 1. CSV Upload & Processing

**Files:** `src/pages/Upload.tsx`, `supabase/functions/process-upload/index.ts`

**Flow:**
1. User uploads CSV or pastes data
2. Frontend detects location columns (city/state/county)
3. File uploaded to Supabase Storage
4. Edge function `process-upload` triggered
5. CSV parsed, validated, staged to `upload_staging`
6. Properties deduplicated and created
7. Violations linked to properties
8. AI scoring triggered (snap_score calculation)

**Key Logic:**
- Addresses normalized to UPPERCASE for consistent matching
- Deduplication via functional unique index
- Supports both city-scope and county-scope uploads
- City extraction from address if city column missing

### 2. Skip Tracing

**Files:** `supabase/functions/skiptrace/index.ts`, `src/hooks/useSkipTrace.ts`

**Flow:**
1. User clicks "Skip Trace" on a property
2. FCRA consent check (first time only)
3. Edge function calls BatchData API
4. Contacts (phones/emails) stored in `property_contacts`
5. Credit consumed from user balance

**Integrations:**
- BatchData API for owner lookup
- Fallback queries if initial request returns no results

### 3. Lead Management

**Files:** `src/pages/Leads.tsx`, `src/components/leads/*`

**Features:**
- Virtual scrolling for large datasets
- Filter by city, state, county, jurisdiction, snap score
- Map view with clustered markers
- Property detail panel with violations, contacts
- Status tracking (New, Contacted, In Progress, etc.)
- Add to custom lists

### 4. Lists

**Files:** `src/pages/Lists.tsx`, `src/hooks/useLists.ts`

- Create named property lists
- Bulk add/remove properties
- Bulk skip trace entire lists
- Export list to CSV

### 5. Geocoding

**Files:** `supabase/functions/geocode-properties/index.ts`

- Background job to add lat/lng to properties
- Uses Mapbox Geocoding API
- Validates addresses before geocoding
- Skips invalid/placeholder addresses

### 6. Role-Based Access

**Files:** `src/components/auth/RoleProtectedRoute.tsx`, `src/hooks/use-auth.ts`

- **Admin:** Full access to all features, admin console
- **VA (Virtual Assistant):** Upload access, VA dashboard, limited leads access
- **User:** Basic access (currently same as admin for most features)

### 7. Export

**Files:** `supabase/functions/export-csv/index.ts`, `src/services/export.ts`

- Export filtered leads to CSV
- Includes property details, violations, contacts

---

## Edge Functions

| Function | Purpose | Auth Required |
|----------|---------|---------------|
| `process-upload` | Parse CSV, create properties/violations | No (webhook-style) |
| `geocode-properties` | Background geocoding | No |
| `skiptrace` | Single property skip trace | Yes |
| `skiptrace-bulk` | Bulk skip trace for lists | Yes |
| `export-csv` | Generate CSV export | No |
| `generate-insights` | AI scoring/insights | No |
| `job-monitor` | Reset stuck jobs | No (cron-style) |
| `reprocess-upload-job` | Retry failed upload | Yes |
| `rerun-failed` | Retry failed geocoding | Yes |
| `delete-upload-job` | Clean up failed upload | Yes |
| `bulk-delete-properties` | Mass delete by location | Yes |
| `create-checkout-session` | Stripe checkout | Yes |
| `create-portal-session` | Stripe billing portal | Yes |
| `stripe-webhook` | Handle Stripe events | No (webhook) |
| `send-user-invitation` | Email new user invites | Yes |

---

## Known Issues & Bugs

### 🔴 Critical / High Priority

1. **Properties Not Creating (FIXED in latest)**
   - **Symptom:** `properties_created: 0` even for new cities
   - **Cause:** Supabase `upsert` with `onConflict` cannot use functional indexes
   - **Fix:** Changed to regular `insert` with duplicate error catching
   - **Status:** ✅ Fixed - needs re-upload to verify

2. **Upload Stuck on "Processing..." UI**
   - **Symptom:** UI shows detection step even after job completes
   - **Cause:** State not resetting when upload starts
   - **Fix:** Reset `detection` and `pendingCsvData` at start of upload
   - **Status:** ✅ Fixed

### 🟡 Medium Priority

3. **Job Progress Not Showing**
   - **Symptom:** Upload completes but user doesn't see progress
   - **Cause:** Race condition between job creation and progress subscription
   - **Status:** Partially fixed with loading card UI

4. **Geocoding Backlog**
   - **Symptom:** 83k+ properties need geocoding
   - **Cause:** Mapbox rate limits, processing speed
   - **Status:** Ongoing - batch processing implemented

5. **Skip Trace Fallback Inconsistent**
   - **Symptom:** Some properties return no contacts
   - **Cause:** BatchData API variations
   - **Status:** Added fallback queries, still not 100%

### 🟢 Low Priority / Cosmetic

6. **Duplicate RLS Policies**
   - Some tables have redundant policies with different names
   - Should consolidate for clarity

7. **VA Dashboard Limited**
   - VA role has access but dashboard is basic
   - Could use more features

---

## Recent Changes (Last 10-15)

1. **Property Insert Fix** - Changed upsert to insert with duplicate catching for functional index compatibility

2. **Upload UI State Reset** - Reset detection/pendingCsvData at upload start to show progress immediately

3. **Loading Card UI** - Added "Creating upload job..." spinner during job creation

4. **Batch Size Reduction** - Reduced property insert batch size from 500 to 50 for reliability

5. **Progress Logging** - Added detailed logging for property insert progress including dupe count

6. **County-Scope Support** - Added `scope` field and handling for county-level uploads

7. **City Extraction Logic** - Auto-extract city from address when city column is empty/invalid

8. **Date Sanitization** - Reject invalid dates (month 00, out-of-range years)

9. **Address Normalization** - Convert addresses to UPPERCASE for consistent matching

10. **Job Monitor Function** - Added edge function to detect and reset stuck jobs

11. **Violation Status Parsing** - Better handling of open/closed status from various CSV formats

12. **Skip Trace Consent Flow** - FCRA compliance modal before first skip trace

13. **Real-time Job Subscriptions** - Subscribe to upload_jobs table for live progress

14. **Role-Based Routing** - Redirect VAs to VA dashboard, admins to leads

15. **Bulk Delete Function** - Edge function to delete all properties by city/state

---

## Pain Points & Fragile Areas

### 🚨 Most Fragile

1. **`process-upload/index.ts`** (1200+ lines)
   - Massive file doing too much
   - Complex deduplication logic
   - Many edge cases for CSV formats
   - **Recommendation:** Refactor into smaller functions

2. **Functional Unique Index**
   - `idx_properties_unique_address` uses `LOWER(TRIM(...))`
   - Standard upsert doesn't work with it
   - Easy to introduce bugs if forgotten
   - **Recommendation:** Document prominently, consider alternative approach

3. **Address Normalization**
   - Multiple places normalize addresses differently
   - Case sensitivity issues between staging → properties → lookup
   - **Recommendation:** Centralize normalization logic

### ⚠️ Needs Attention

4. **CSV Column Detection**
   - `src/utils/csvLocationDetector.ts` uses heuristics
   - Can fail with unusual column names
   - **Recommendation:** Add manual column mapping UI

5. **Geocoding Rate Limits**
   - Mapbox has request limits
   - Large uploads can take hours to geocode
   - **Recommendation:** Implement queue/priority system

6. **Credit System**
   - Multiple ledger tables (`credit_ledger`, `credit_ledger_skiptrace`)
   - Inconsistent usage tracking
   - **Recommendation:** Consolidate credit tracking

7. **Real-time Subscriptions**
   - Can miss events if connection drops
   - No reconnection logic
   - **Recommendation:** Add heartbeat/reconnection

### 💡 Technical Debt

8. **Component Size**
   - `Upload.tsx` is 600+ lines
   - `Leads.tsx` is similarly large
   - **Recommendation:** Extract to smaller components

9. **Type Safety**
   - Some `any` types in edge functions
   - Missing interfaces for API responses
   - **Recommendation:** Add strict typing

10. **Error Handling**
    - Many errors logged but not surfaced to user
    - **Recommendation:** Centralize error handling with user feedback

---

## Environment & Configuration

### Required Secrets (Edge Functions)

| Secret | Purpose | Where to Get |
|--------|---------|--------------|
| `BATCHDATA_API_KEY` | Skip tracing | [BatchData Dashboard](https://batchdata.com) |
| `MAPBOX_ACCESS_TOKEN` | Geocoding | [Mapbox Account](https://mapbox.com) |
| `STRIPE_SECRET_KEY` | Billing | [Stripe Dashboard](https://stripe.com) |
| `STRIPE_WEBHOOK_SECRET` | Webhook verification | Stripe Dashboard |

### Auto-Configured (Lovable Cloud)

- `SUPABASE_URL` - Database URL
- `SUPABASE_ANON_KEY` - Public API key
- `SUPABASE_SERVICE_ROLE_KEY` - Admin API key (edge functions only)

### Frontend Environment

```env
VITE_SUPABASE_URL=https://[project-id].supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=[anon key]
VITE_SUPABASE_PROJECT_ID=[project-id]
```

### Supabase Config

See `supabase/config.toml`:
- Functions with `verify_jwt = false`: geocode-properties, process-upload, generate-insights, export-csv, job-monitor
- These are either webhook-style or background jobs

### Key File Locations

```
src/
├── pages/           # Route components
├── components/      # UI components
│   ├── auth/        # Auth guards
│   ├── leads/       # Lead management UI
│   ├── upload/      # Upload flow components
│   └── ui/          # shadcn components
├── hooks/           # React Query hooks
├── services/        # API service functions
├── schemas/         # Zod validation schemas
└── integrations/
    └── supabase/
        ├── client.ts   # DO NOT EDIT - auto-generated
        └── types.ts    # DO NOT EDIT - auto-generated

supabase/
├── config.toml      # Function config
└── functions/       # Edge functions (Deno)
```

---

## Bug/Issue Report

### Issue #1: Properties Not Being Created

**Problem:** When uploading CSVs, `properties_created` showed 0 even for cities with no existing properties.

**Root Cause:** The code used Supabase `upsert` with `onConflict: 'address,city,state,zip'`, but the database has a **functional unique index**:
```sql
CREATE UNIQUE INDEX idx_properties_unique_address 
ON properties (LOWER(TRIM(address)), LOWER(TRIM(city)), LOWER(TRIM(state)), LOWER(TRIM(zip)));
```

Supabase's `upsert` cannot use functional indexes - it needs a direct column constraint. The operation was silently failing.

**Fix:** Changed from `upsert` to regular `insert` with batch processing and individual fallback:
```typescript
// Try batch insert
const { data, error } = await supabase.from('properties').insert(batch).select('id');
if (error?.code === '23505') {
  // Batch has duplicates, insert one by one
  for (const prop of batch) {
    const { error } = await supabase.from('properties').insert(prop);
    if (error?.code === '23505') dbLevelDedupes++;
  }
}
```

**Related Issues:** None - isolated fix.

**Status:** ✅ Fixed - needs verification with fresh upload.

---

### Issue #2: Upload UI Stuck on Processing

**Problem:** After clicking "Process Upload", the UI stayed on the location detection step showing "Processing..." indefinitely, even though the backend completed.

**Root Cause:** The `detection` and `pendingCsvData` states were not cleared when starting the upload. The UI rendered the detection component instead of the job progress component.

**Fix:** Reset states at the beginning of upload functions:
```typescript
const handleConfirmUpload = async () => {
  // Cache what we need
  const csvData = pendingCsvData;
  const det = detection;
  
  // IMMEDIATELY reset so progress shows
  setDetection(null);
  setPendingCsvData(null);
  
  // Now proceed with upload
  setUploading(true);
  // ...
};
```

**Related Issues:** Added a "Creating upload job..." loading card for the brief moment between upload start and job ID return.

**Status:** ✅ Fixed.

---

### Issue #3: Violations Created But Not Properties

**Problem:** Upload showed violations being created but 0 properties created, which was confusing.

**Root Cause:** Same as Issue #1 - the upsert was failing silently. However, violations were still being created because they linked to properties looked up by address (existing ones).

**Fix:** Same as Issue #1.

**Status:** ✅ Fixed.

---

### Issue #4: Duplicate Uploads Creating Duplicate Properties

**Problem:** Early versions allowed duplicate properties with slightly different formatting.

**Root Cause:** No unique constraint on properties table initially. Later, the functional unique index was added but app-level deduplication was inconsistent.

**Fix:** 
1. Added functional unique index at DB level
2. Normalize addresses to UPPERCASE before insert
3. Check existing properties before insert

**Current State:** Fixed, but the functional index complication remains a footgun.

**Status:** ✅ Fixed but needs care.

---

### Issue #5: Geocoding Jobs Getting Stuck

**Problem:** Geocoding jobs would get stuck in "running" status forever.

**Root Cause:** Edge function timeouts without proper cleanup. Also, MAPBOX_ACCESS_TOKEN not configured initially.

**Fix:** 
1. Added `job-monitor` edge function to reset stuck jobs
2. Added token validation with graceful skip (not fail) if missing
3. Reduced batch sizes to stay within timeouts

**Status:** ✅ Fixed.

---

### Issue #6: City Field Contains Violation Text

**Problem:** Some CSVs have the city column containing violation descriptions like "Debris in yard..."

**Root Cause:** Poor CSV formatting from source data.

**Fix:** Added `isValidCityName()` validation that rejects:
- Text over 50 characters
- Multi-sentence text
- Violation keywords (debris, trash, weeds, etc.)
- Special punctuation (colons, semicolons, brackets)

**Status:** ✅ Fixed.

---

### Issue #7: Invalid Dates Causing Insert Failures

**Problem:** Dates like "2025-00-11" or "2025-91-30" caused Postgres errors.

**Root Cause:** Source CSVs contain malformed date data.

**Fix:** Added `sanitizeDateString()` function that validates:
- Month is 1-12
- Day is 1-31
- Year is 1950-2100
- Returns `null` for invalid dates

**Status:** ✅ Fixed.

---

### Current Known Issues (Unresolved)

1. **Large file uploads may timeout** - Files over 10MB can hit edge function memory limits
2. **Skip trace returns no results for some properties** - BatchData API coverage varies
3. **Geocoding backlog** - Thousands of properties awaiting geocoding
4. **Credit tracking across multiple tables** - Confusing architecture
5. **VA role has limited functionality** - Dashboard needs more features

---

## Recommendations for Next Developer

1. **Before any upload changes:** Test with small CSV, check logs, verify both `properties_created` and `violations_created` are non-zero for new cities

2. **The functional unique index is the source of truth:** Don't try to use upsert with onConflict for properties

3. **Check edge function logs first:** `supabase--edge-function-logs` tool is essential for debugging

4. **Monitor upload_jobs table:** Query recent jobs to see status, error_message, counts

5. **Real-time debugging:** The upload progress uses Supabase realtime - check channel subscriptions if progress doesn't update

6. **Address normalization:** Always uppercase addresses before comparing or inserting

7. **Test with production-like data:** The issues often only appear with real messy CSVs, not clean test data
