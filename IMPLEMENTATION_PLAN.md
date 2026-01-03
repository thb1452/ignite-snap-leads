# COMPLETE CSV AGGREGATION IMPLEMENTATION PLAN

## 🔍 CURRENT STATE ANALYSIS

### Existing Columns (from migration 20251209002418)
✅ `total_violations` INTEGER DEFAULT 0
✅ `open_violations` INTEGER DEFAULT 0
✅ `violation_types` TEXT[] DEFAULT '{}'
✅ `repeat_offender` BOOLEAN DEFAULT false
✅ `oldest_violation_date` DATE
✅ `newest_violation_date` DATE

### Added by Migration 20260103000000
✅ `last_enforcement_date` TIMESTAMPTZ
✅ Indexes for filtering performance

### Column Mapping
| User Requested | Database Column | Status |
|---------------|-----------------|---------|
| violation_count | total_violations | ✅ Exists |
| has_open_violations | Calculated: `open_violations > 0` | ✅ No column needed |
| violation_types | violation_types | ✅ Exists |
| repeat_offender | repeat_offender | ✅ Exists |
| last_enforcement_date | last_enforcement_date | ✅ Added |

---

## 📋 IMPLEMENTATION STEPS

### Step 1: Update Migration (Already Done)
- ✅ Migration 20260103000000 adds `last_enforcement_date` + indexes
- No additional columns needed

### Step 2: Update CSV Import Logic
File: `supabase/functions/process-upload/index.ts`

**Changes Required:**
1. Modify `addressMap` to store violations array
2. Add `aggregateViolations()` helper function
3. Calculate aggregates when creating properties
4. Update existing properties with fresh aggregates

### Step 3: Create Backfill Script
File: `supabase/functions/backfill-property-aggregates/index.ts`

**Purpose:** Populate aggregates for existing 220k properties

**Strategy:**
- Batch process in chunks of 100 properties
- For each property, query its violations
- Calculate aggregates
- Update property record
- Track progress in upload_jobs table

---

## ⚠️ RISKS & MITIGATIONS

### Risk 1: 220k Properties to Backfill
**Mitigation:**
- Process in batches of 100
- Add progress tracking
- Allow pause/resume
- Estimated time: 30-60 minutes

### Risk 2: Existing Properties Have Default Values (0, false, [])
**Mitigation:**
- Backfill script will recalculate from violations table
- New imports will have correct values immediately

### Risk 3: Violat ions Table Might Be Missing Data
**Mitigation:**
- Script will skip properties with no violations (set to 0)
- Log properties that can't be processed

---

## 🎯 EXECUTION PLAN

### Phase 1: CSV Import Update (SAFE - No Data Change)
1. Apply code changes to `process-upload/index.ts`
2. Test with NEW CSV upload only
3. Verify aggregates are calculated correctly

### Phase 2: Migration (SAFE - Adds Columns/Indexes Only)
1. Run migration 20260103000000
2. Verify columns exist
3. No data modified yet

### Phase 3: Backfill (HIGH IMPACT - Touches 220k Properties)
1. **REVIEW REQUIRED BEFORE EXECUTION**
2. Run backfill script in batches
3. Monitor progress
4. Verify sample properties

---

## 📊 EXPECTED RESULTS

### After CSV Import Update
- ✅ New property imports have correct aggregates immediately
- ✅ Filters work for newly imported properties
- ❌ Existing 220k properties still have defaults (0, false, [])

### After Backfill
- ✅ All 220k properties have correct aggregates
- ✅ All filters work across entire dataset
- ✅ No "Generate Insights" step needed

---

## 🔍 VALIDATION QUERIES

### Check Current State (Before Backfill)
```sql
-- Count properties with default values
SELECT
  COUNT(*) as total_properties,
  COUNT(*) FILTER (WHERE total_violations = 0) as zero_violations,
  COUNT(*) FILTER (WHERE open_violations = 0) as zero_open,
  COUNT(*) FILTER (WHERE violation_types = '{}') as empty_types
FROM properties;
```

### Sample Property Check
```sql
-- Compare property aggregates vs actual violations
SELECT
  p.id,
  p.address,
  p.city,
  p.state,
  p.total_violations as agg_total,
  p.open_violations as agg_open,
  p.violation_types as agg_types,
  COUNT(v.*) as actual_total,
  COUNT(v.*) FILTER (WHERE v.status = 'Open') as actual_open,
  ARRAY_AGG(DISTINCT v.violation_type) as actual_types
FROM properties p
LEFT JOIN violations v ON v.property_id = p.id
WHERE p.city = 'ball ground' AND p.state = 'ga'
GROUP BY p.id
LIMIT 10;
```

### After Backfill Validation
```sql
-- Verify aggregates match reality
SELECT
  COUNT(*) as properties_with_violations,
  AVG(total_violations) as avg_violations,
  COUNT(*) FILTER (WHERE open_violations > 0) as with_open_violations,
  COUNT(*) FILTER (WHERE repeat_offender = true) as repeat_offenders
FROM properties
WHERE total_violations > 0;
```

---

## 📝 FILES TO CREATE/MODIFY

### 1. Migration (Already Created)
- ✅ `supabase/migrations/20260103000000_add_last_enforcement_date.sql`

### 2. CSV Import Update (To Create)
- ⏳ Modify `supabase/functions/process-upload/index.ts`

### 3. Backfill Script (To Create)
- ⏳ `supabase/functions/backfill-property-aggregates/index.ts`
- ⏳ `supabase/functions/backfill-property-aggregates/deno.json`

### 4. Backfill Invocation Script (To Create)
- ⏳ `scripts/run-backfill.ts` (for manual execution)

---

## ⏱️ ESTIMATED TIMELINE

| Phase | Time | Risk |
|-------|------|------|
| CSV Import Update | 30 min | Low |
| Migration | 5 min | Low |
| Backfill Script Creation | 45 min | Low |
| **Backfill Execution** | **30-60 min** | **Medium** |
| Validation | 15 min | Low |
| **Total** | **~2-3 hours** | |

---

## ✋ APPROVAL GATES

### Gate 1: Code Review
**Before Proceeding:**
- Review CSV import changes
- Review backfill script logic
- Approve aggregation algorithm

### Gate 2: Test Migration
**Before Production:**
- Run migration in dev/staging
- Verify no errors
- Check indexes created

### Gate 3: Backfill Execution
**Before Touching 220k Properties:**
- Review backfill script ONE MORE TIME
- Test on 10 sample properties first
- Verify aggregates match expectations
- Get explicit GO/NO-GO approval

---

## 🚀 NEXT STEPS

**Awaiting Your Approval To:**

1. ✅ Apply CSV import changes (safe, only affects new imports)
2. ✅ Run migration (safe, adds columns/indexes)
3. ❌ Create backfill script (for your review)
4. ❌ Execute backfill (REQUIRES EXPLICIT APPROVAL)

**Which would you like me to proceed with?**
