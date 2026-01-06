# Database Performance & Security Audit Report

**Date:** 2026-01-05
**Project:** Ignite Snap Leads
**Auditor:** Claude Code

## Executive Summary

This audit examined database indexing, Row-Level Security (RLS), pagination strategies, N+1 query patterns, API key security, and backup procedures. Several critical issues were identified along with performance optimizations that have already been implemented.

---

## 1. Column Indexing Analysis

### ✅ GOOD: Well-Indexed Columns

The following filtered columns have proper indexes:

**State Filtering:**
- `idx_properties_state_lower ON properties(lower(state))` (20260102144450)
- Enables case-insensitive state filtering

**City Filtering:**
- `idx_properties_city_lower ON properties(lower(city))` (20260102144450)
- Enables case-insensitive city filtering
- Additional materialized view indexes: `idx_mv_cities_state`, `idx_mv_cities_city`

**SNAP Score (Primary Sorting):**
- `idx_properties_snap_score_desc ON properties(snap_score DESC NULLS LAST)` (20260102144450)
- `idx_properties_snap_score ON properties(snap_score DESC NULLS LAST)` (multiple migrations)
- Optimized for default sort order

**Jurisdiction:**
- `idx_properties_jurisdiction_id ON properties(jurisdiction_id)` (20251124001703)

**Enforcement Date Filtering:**
- `idx_properties_last_enforcement_date ON properties(last_enforcement_date DESC NULLS LAST)` (20260103000000)

**Pressure Level Filters:**
- `idx_properties_open_violations ON properties(open_violations) WHERE open_violations > 0` (20260103000000) - Partial index!
- `idx_properties_total_violations ON properties(total_violations) WHERE total_violations > 0` (20260103000000) - Partial index!
- `idx_properties_repeat_offender ON properties(repeat_offender) WHERE repeat_offender = true` (20260103000000) - Partial index!

**Geospatial:**
- `idx_properties_geom ON properties USING GIST(geom)` (20251009012417)

**Opportunity Classification:**
- `idx_properties_opportunity_class ON properties(opportunity_class)` (20251209002418)

**Address/City Composite:**
- `idx_properties_address_city ON properties(address, city, state, zip)` (20251028012247)

### ⚠️ MISSING: No Index on County

**Issue:** The `county` column is used for filtering in `properties.ts:105`:
```typescript
if (filters.county) {
  q = q.ilike("county", `%${filters.county}%`);
}
```

**Impact:**
- Full table scan when filtering by county
- Slow query performance for county-based searches
- Case-insensitive LIKE queries are especially slow without indexes

**Recommendation:**
```sql
CREATE INDEX idx_properties_county_lower ON properties(lower(county));
```

### ⚠️ MISSING: No Index on violation_type (violations table)

**Issue:** The `violation_type` column is used for filtering in `properties.ts:148-150`:
```typescript
if (filters.violationType) {
  q = q.contains("violation_types", [filters.violationType]);
}
```

**Note:** The filter checks `violation_types` (array on properties), not the violations table directly. However, violations are queried separately in several places:
- `FilterControls.tsx:38` - Fetches distinct violation types
- `Leads.tsx:246` - Queries violations by property_id
- Export CSV function joins violations

**Current State:**
- No index on `violations.violation_type`
- No GIN index on `properties.violation_types` array column

**Recommendation:**
```sql
-- For the violations table
CREATE INDEX idx_violations_violation_type ON violations(violation_type);

-- For the properties array column (if array filtering is used)
CREATE INDEX idx_properties_violation_types_gin ON properties USING GIN(violation_types);
```

---

## 2. Row-Level Security (RLS) Policies

### ✅ EXCELLENT: RLS is Enabled and Properly Configured

**Migration:** `20251215000000_enable_rls_security.sql`

**Tables with RLS:**
1. `properties` - Enabled ✅
2. `violations` - Enabled ✅
3. `lead_activity` - Enabled ✅
4. `lead_lists` - Enabled ✅
5. `list_properties` - Enabled ✅

### Policy Summary

**Properties (Shared Data Model):**
- ✅ Anyone can view properties (authenticated users)
- ✅ Authenticated users can insert properties
- ✅ Authenticated users can update properties
- ✅ `created_by` column tracks ownership (nullable for legacy data)

**Violations (Shared Data Model):**
- ✅ Anyone can view violations (authenticated users)
- ✅ Authenticated users can insert/update violations
- Violations are public municipal data

**Lead Activity (Private):**
- ✅ Users can only view their own activity
- ✅ Users can only insert/update/delete their own activity
- ✅ Policy enforces `user_id = auth.uid()`

**Lead Lists (Private):**
- ✅ Users can only view their own lists
- ✅ Users can only insert/update/delete their own lists
- ✅ Policy enforces `user_id = auth.uid()`

**List Properties (Private via Parent List):**
- ✅ Users can only view properties in their own lists
- ✅ Subquery validates list ownership
- ✅ Users can only insert/delete from their own lists

**Security Assessment:** RLS is properly implemented with a clear separation between shared public data (properties, violations) and private user data (lists, activity).

---

## 3. Pagination Implementation

### ✅ GOOD: Pagination is Implemented

**Method:** LIMIT/OFFSET pagination with estimated counts

**Implementation Details:**

1. **Optimized RPC Function** (`fn_properties_paged` - 20260102144450):
   - Uses `LIMIT`/`OFFSET` for pagination
   - Estimated count from `pg_class.reltuples` for instant pagination UI
   - Falls back to filtered count (capped at 10,000) when filters are applied
   - Returns: `{ data: [], total: number, page: number, pageSize: number }`

2. **Legacy Query Path** (`fetchPropertiesPagedLegacy` in `properties.ts:82-179`):
   - Uses `.range(from, to)` (Supabase's LIMIT/OFFSET wrapper)
   - Estimated count: `{ count: "estimated" }`
   - Used for complex filters (lists, violation types, multi-city, pressure levels)

**Page Sizes:**
- Default: 25 properties per page
- Map bbox queries: 50 properties per page
- Export CSV: Batched at 1000 rows per fetch

### ⚠️ Performance Consideration: OFFSET Limitations

**Issue:** OFFSET-based pagination degrades performance on large offsets (e.g., page 1000 with 25 items/page = OFFSET 25000).

**Current Mitigation:**
- Most users view early pages (1-10)
- Estimated counts prevent expensive COUNT(*) queries
- Indexes on `snap_score DESC` help with ORDER BY performance

**Alternative (if needed):** Cursor-based pagination using `snap_score` + `id`:
```sql
WHERE (snap_score, id) < (last_score, last_id)
ORDER BY snap_score DESC, id DESC
LIMIT 25
```

---

## 4. N+1 Query Patterns

### ✅ MOSTLY GOOD: No Major N+1 Patterns in User-Facing Code

**Analyzed Locations:**

1. **Property List Queries** (`properties.ts`, `useProperties.ts`):
   - ✅ Fetches properties in a single query
   - ✅ Does NOT load violations per property
   - Properties contain aggregated violation data (`total_violations`, `open_violations`, `violation_types`)

2. **Violation Loading for Multiple Properties** (`Leads.tsx:246`, `Lists.tsx:234`):
   - ✅ Uses `.in("property_id", propertyIds)` to fetch violations for all properties at once
   - ✅ NOT an N+1 pattern - single query for all violations

3. **Export CSV Function** (`export-csv/index.ts:96-110`):
   - ✅ Uses JOIN syntax: `.select('address, city, state, violations(violation_type, status)')`
   - ✅ Single query with nested join - NOT N+1

### ⚠️ Minor N+1 Pattern: Property Detail Panels

**Location:**
- `PropertyDetailPanel.tsx:84-87`
- `MobilePropertyDetailSheet.tsx:55-58`

**Pattern:**
```typescript
const { data, error } = await supabase
  .from('violations')
  .select('...')
  .eq('property_id', property.id)  // Separate query per property detail view
```

**Assessment:** Acceptable because:
- Only triggered when user opens a single property detail
- Not a loop - only one property is viewed at a time
- Indexed query on `violations.property_id`

**Recommendation:** No action needed - this is expected behavior for detail views.

### ⚠️ N+1 Pattern in Background Job

**Location:** `backfill-property-aggregates/index.ts:127-130`

```typescript
for (const property of properties) {
  const { data: violations } = await supabase
    .from("violations")
    .select("violation_type, status, opened_date, case_id")
    .eq("property_id", property.id);  // N+1 query!
}
```

**Impact:**
- Background job performance issue
- If processing 10,000 properties, makes 10,000 separate queries

**Recommendation:** Batch fetch violations:
```typescript
const propertyIds = properties.map(p => p.id);
const { data: allViolations } = await supabase
  .from("violations")
  .select("property_id, violation_type, status, opened_date, case_id")
  .in("property_id", propertyIds);

// Group by property_id
const violationsByProperty = allViolations.reduce((acc, v) => {
  if (!acc[v.property_id]) acc[v.property_id] = [];
  acc[v.property_id].push(v);
  return acc;
}, {});

for (const property of properties) {
  const violations = violationsByProperty[property.id] || [];
  // Process violations
}
```

---

## 5. API Key Security

### 🚨 CRITICAL: .env File is Committed to Git

**Issue:** The `.env` file is tracked in version control:
```bash
$ git ls-files .env
.env
```

**Content:**
```env
VITE_SUPABASE_PROJECT_ID="ojyxblegxpdgaqiscxpz"
VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGci..."
VITE_SUPABASE_URL="https://ojyxblegxpdgaqiscxpz.supabase.co"
```

**Security Impact:**
- ⚠️ Publishable (anon) key is public by design - this is acceptable
- ⚠️ Project ID is visible in the URL - also public
- However, committing `.env` is a bad practice that could expose secrets if:
  - Service keys are added later
  - Stripe keys are added
  - Third-party API keys are added

**Additional Issues:**
- `.env` is NOT in `.gitignore`
- Any developer could accidentally commit sensitive keys

### ✅ GOOD: API Keys Properly Used in Code

**Client-Side Usage:**
```typescript
// src/integrations/supabase/client.ts
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
```

**Edge Functions:**
```typescript
// Properly read from Deno.env (not committed)
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
```

**RLS Protection:**
- ✅ Edge functions use user JWT tokens for authentication
- ✅ RLS policies enforce data access control
- ✅ Export function checks user authentication before allowing CSV export

### 🚨 CRITICAL: Edge Functions Have JWT Verification Disabled

**Location:** `supabase/config.toml`

```toml
[functions.geocode-properties]
verify_jwt = false

[functions.process-upload]
verify_jwt = false

[functions.generate-insights]
verify_jwt = false

[functions.export-csv]
verify_jwt = false

[functions.job-monitor]
verify_jwt = false
```

**Issue:** All edge functions have JWT verification disabled!

**Impact:**
- Functions manually verify JWTs in code (e.g., `export-csv/index.ts:42-66`)
- Increases risk of authentication bypass if code is buggy
- Double-handling of auth logic

**Recommendation:** Enable `verify_jwt = true` and rely on Supabase's built-in JWT verification.

### Recommendations

1. **IMMEDIATE: Remove .env from git**
   ```bash
   git rm --cached .env
   echo ".env" >> .gitignore
   echo ".env.local" >> .gitignore
   git commit -m "Remove .env from version control"
   ```

2. **IMMEDIATE: Enable JWT verification in config.toml**
   ```toml
   [functions.export-csv]
   verify_jwt = true
   ```

3. **Create .env.example template:**
   ```env
   VITE_SUPABASE_PROJECT_ID="your-project-id"
   VITE_SUPABASE_PUBLISHABLE_KEY="your-anon-key"
   VITE_SUPABASE_URL="https://your-project.supabase.co"
   ```

---

## 6. Backup & Export Functionality

### ✅ GOOD: CSV Export Functionality Exists

**Location:** `supabase/functions/export-csv/index.ts`, `src/services/export.ts`

**Features:**
- ✅ Exports properties with violations
- ✅ Respects RLS policies (requires authentication)
- ✅ Usage limits enforced via `check_usage_limit` RPC
- ✅ Batched fetching (1000 rows at a time)
- ✅ One row per violation (denormalized)
- ✅ Clean fields only - excludes sensitive PII like `raw_description`

**Usage Tracking:**
- Records export events in `usage_events` table
- Limits based on subscription tier

### ⚠️ MISSING: Database Backup Strategy

**No Automated Backups Found:**
- No `pg_dump` scripts
- No backup configuration in `supabase/config.toml`
- No scheduled backup jobs

**Supabase Cloud Backups (Default):**
- Supabase provides automatic daily backups for paid plans
- Point-in-time recovery (PITR) available on Pro plan and above
- Backups retained for 7-30 days depending on plan

**Recommendations:**

1. **Verify Supabase backup settings:**
   - Check Supabase Dashboard → Database → Backups
   - Ensure daily backups are enabled
   - Test restore procedure

2. **Implement additional backup strategy for critical data:**
   ```bash
   # Manual backup script (example)
   pg_dump $DATABASE_URL > backups/snapleads_$(date +%Y%m%d).sql
   ```

3. **Document disaster recovery procedures:**
   - How to restore from Supabase backup
   - How to export/import specific tables
   - Contact procedures for data loss incidents

---

## Summary of Findings

| Category | Status | Issues | Priority |
|----------|--------|--------|----------|
| **Column Indexing** | ⚠️ Mostly Good | Missing indexes on `county` and `violation_type` | Medium |
| **RLS Policies** | ✅ Excellent | None - well implemented | - |
| **Pagination** | ✅ Good | OFFSET limitations at high pages (minor) | Low |
| **N+1 Queries** | ⚠️ Good | Background job N+1 pattern | Medium |
| **API Key Security** | 🚨 Critical Issues | .env in git, JWT verification disabled | **HIGH** |
| **Backup/Export** | ⚠️ Partial | CSV export exists, but no custom DB backups | Medium |

---

## Immediate Action Items (Priority Order)

1. 🚨 **HIGH PRIORITY: Remove .env from git and add to .gitignore**
2. 🚨 **HIGH PRIORITY: Enable JWT verification in supabase/config.toml**
3. ⚠️ **MEDIUM: Add index on county column**
4. ⚠️ **MEDIUM: Add index on violation_type**
5. ⚠️ **MEDIUM: Fix N+1 query in backfill-property-aggregates function**
6. ⚠️ **MEDIUM: Verify Supabase backup settings and document recovery procedures**

---

## Recommended SQL Migrations

```sql
-- Add missing indexes
CREATE INDEX CONCURRENTLY idx_properties_county_lower ON properties(lower(county));
CREATE INDEX CONCURRENTLY idx_violations_violation_type ON violations(violation_type);
CREATE INDEX CONCURRENTLY idx_properties_violation_types_gin ON properties USING GIN(violation_types);
```

**Note:** Use `CREATE INDEX CONCURRENTLY` to avoid locking the table during index creation in production.

---

**End of Audit Report**
