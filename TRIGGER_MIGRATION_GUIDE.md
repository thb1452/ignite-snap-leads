# Property Aggregation Trigger - Migration Guide

## 🎯 What This Does

Creates a PostgreSQL trigger that **automatically** updates property aggregates whenever violations are added, modified, or deleted.

### Aggregates Maintained:
- `total_violations` - Total count of violations
- `open_violations` - Count of violations with status='Open'
- `violation_types` - Array of unique violation types
- `repeat_offender` - Boolean (true if multiple case_ids)
- `last_enforcement_date` - Most recent violation opened_date

---

## 📋 Migration File

**Location:** `supabase/migrations/20260103000100_create_aggregation_trigger.sql`

**Contains:**
1. ✅ Trigger function definition
2. ✅ Trigger creation (fires on INSERT/UPDATE/DELETE)
3. ✅ One-time backfill of existing data
4. ✅ Verification queries

---

## 🚀 How to Apply

### Option 1: Supabase CLI (Recommended)
```bash
# If you have Supabase CLI installed locally
cd /path/to/ignite-snap-leads

# Apply the migration
supabase db reset

# Or apply just this migration
supabase migration up
```

### Option 2: Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to: **Database** → **Migrations**
3. Click **New Migration**
4. Copy content from `supabase/migrations/20260103000100_create_aggregation_trigger.sql`
5. Click **Run**

### Option 3: Direct SQL (for testing)
```bash
# Connect to your database
psql <your-connection-string>

# Run the migration file
\i supabase/migrations/20260103000100_create_aggregation_trigger.sql
```

---

## ✅ Verification Steps

### Step 1: Check Trigger Exists
```sql
-- Verify trigger function exists
SELECT proname, prosrc
FROM pg_proc
WHERE proname = 'update_property_aggregates';

-- Verify trigger exists on violations table
SELECT tgname, tgtype, tgenabled
FROM pg_trigger
WHERE tgname = 'property_aggregates_trigger';
```

**Expected:** Both queries return results

---

### Step 2: Check Backfill Results
```sql
-- Check how many properties now have aggregates
SELECT
  COUNT(*) as total_properties,
  COUNT(*) FILTER (WHERE total_violations > 0) as with_violations,
  COUNT(*) FILTER (WHERE open_violations > 0) as with_open,
  COUNT(*) FILTER (WHERE repeat_offender = true) as repeat_offenders,
  AVG(total_violations) FILTER (WHERE total_violations > 0) as avg_violations
FROM properties;
```

**Expected:**
- `with_violations` > 0 (properties that have violations)
- `avg_violations` > 0 (reasonable average)

---

### Step 3: Spot Check Sample Properties
```sql
-- Compare aggregates vs actual violations
SELECT
  p.id,
  p.address,
  p.city,
  p.state,
  -- Aggregated values (from trigger)
  p.total_violations as agg_total,
  p.open_violations as agg_open,
  ARRAY_LENGTH(p.violation_types, 1) as agg_type_count,
  p.repeat_offender as agg_repeat,
  -- Actual values (from violations table)
  COUNT(v.*) as actual_total,
  COUNT(v.*) FILTER (WHERE LOWER(TRIM(v.status)) = 'open') as actual_open,
  COUNT(DISTINCT v.case_id) as actual_cases
FROM properties p
LEFT JOIN violations v ON v.property_id = p.id
WHERE p.city = 'winston-salem' OR p.city = 'ball ground'
GROUP BY p.id
HAVING COUNT(v.*) > 0
LIMIT 10;
```

**Expected:** `agg_total` = `actual_total` for all rows

---

### Step 4: Test Trigger with New Violation
```sql
-- Insert a test violation
INSERT INTO violations (
  property_id,
  violation_type,
  status,
  opened_date,
  case_id
)
SELECT
  id,
  'Test-Trigger-Verification',
  'Open',
  NOW(),
  'TEST-CASE-001'
FROM properties
WHERE city = 'winston-salem'
LIMIT 1
RETURNING property_id;

-- Check that property was auto-updated
-- Replace <property_id> with the ID from above
SELECT
  total_violations,
  open_violations,
  violation_types
FROM properties
WHERE id = '<property_id>';

-- Cleanup
DELETE FROM violations
WHERE violation_type = 'Test-Trigger-Verification';
```

**Expected:** Property aggregates update immediately after INSERT

---

## 🔄 What Happens After Migration

### Immediate Effect (Backfill)
- ✅ All existing properties recalculated
- ✅ Aggregates populated based on current violations
- ⏱️ Takes ~1-5 minutes for 220k properties

### Ongoing Effect (Trigger)
- ✅ Any violation INSERT → property auto-updated
- ✅ Any violation UPDATE → property auto-updated
- ✅ Any violation DELETE → property auto-updated
- ✅ No manual updates needed

---

## 🧪 Testing with Winston-Salem CSV

After migration is applied:

### 1. Re-upload Winston-Salem CSV
```bash
# Go to Upload page
# Select Winston-Salem CSV
# Click Upload
```

### 2. Verify Aggregates Populated
```sql
SELECT
  COUNT(*) as total_properties,
  COUNT(*) FILTER (WHERE total_violations > 0) as with_violations,
  AVG(total_violations) as avg_violations,
  MAX(total_violations) as max_violations
FROM properties
WHERE city = 'winston-salem';
```

### 3. Test Filters
```javascript
// In the UI, try these filters:
// - Open Violations Only
// - Multiple Violations
// - Repeat Offender

// Should return actual results (not 0)
```

---

## 🐛 Troubleshooting

### Issue: Backfill didn't run
```sql
-- Check if backfill completed
SELECT COUNT(*) FROM properties WHERE total_violations > 0;
```

**Fix:** Manually run backfill section from migration

---

### Issue: Trigger not firing
```sql
-- Check trigger is enabled
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgname = 'property_aggregates_trigger';

-- tgenabled should be 'O' (origin/enabled)
```

**Fix:** Re-create trigger
```sql
DROP TRIGGER IF EXISTS property_aggregates_trigger ON violations;
CREATE TRIGGER property_aggregates_trigger
  AFTER INSERT OR UPDATE OR DELETE ON violations
  FOR EACH ROW
  EXECUTE FUNCTION update_property_aggregates();
```

---

### Issue: Aggregates don't match
```sql
-- Force recalculation for one property
UPDATE violations
SET status = status
WHERE property_id = '<your-property-id>'
LIMIT 1;
```

**Fix:** This triggers recalculation

---

## 📊 Performance Impact

### Trigger Overhead
- **INSERT violation:** ~1-2ms additional time
- **UPDATE violation:** ~1-2ms additional time
- **DELETE violation:** ~1-2ms additional time

### Backfill Time
- **220k properties:** ~3-5 minutes
- **Per property:** ~1-2ms

**Conclusion:** Negligible impact, well worth the automatic sync

---

## ✅ Success Criteria

After migration, you should see:

1. ✅ Trigger function exists
2. ✅ Trigger is enabled on violations table
3. ✅ Backfill completed (properties have non-zero aggregates)
4. ✅ Sample properties match actual violations
5. ✅ Filters return results (not 0)
6. ✅ New CSV uploads auto-populate aggregates

---

## 🎉 Benefits

**Before Trigger:**
- ❌ Manual "Generate Insights" required
- ❌ Filters return 0 results
- ❌ Stale data after CSV uploads
- ❌ Backfill script needed

**After Trigger:**
- ✅ Automatic updates
- ✅ Filters work immediately
- ✅ Always in sync
- ✅ No manual steps

---

## 🚀 Next Steps

1. Apply migration
2. Run verification queries
3. Re-upload Winston-Salem CSV
4. Test filters in UI
5. Celebrate! 🎊
