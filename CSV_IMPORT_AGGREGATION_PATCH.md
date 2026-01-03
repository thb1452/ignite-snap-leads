# CSV Import Aggregation Patch

## Changes Needed in `supabase/functions/process-upload/index.ts`

### 1. Update addressMap Structure (Line ~828-863)

**BEFORE:**
```typescript
const addressMap = new Map<string, any>();
stagingData.forEach(row => {
  // ... validation ...
  const key = `${addr}|${city}|${state}|${zip}`.toLowerCase();
  if (!addressMap.has(key)) {
    addressMap.set(key, {
      address: addr,
      city,
      state,
      zip,
      jurisdiction_id: job.jurisdiction_id || null
    });
  }
});
```

**AFTER:**
```typescript
// Store violations grouped by address for aggregation
const addressMap = new Map<string, {
  address: string;
  city: string;
  state: string;
  zip: string;
  jurisdiction_id: string | null;
  violations: Array<{
    violation_type: string | null;
    status: string;
    opened_date: string | null;
    case_id: string | null;
  }>;
}>();

stagingData.forEach(row => {
  // ... validation (keep existing code) ...
  const key = `${addr}|${city}|${state}|${zip}`.toLowerCase();

  if (!addressMap.has(key)) {
    addressMap.set(key, {
      address: addr,
      city,
      state,
      zip,
      jurisdiction_id: job.jurisdiction_id || null,
      violations: []
    });
  }

  // Add this violation to the address's violation list
  const addressData = addressMap.get(key)!;
  addressData.violations.push({
    violation_type: row.violation_type || null,
    status: row.status || 'Open',
    opened_date: row.opened_date || null,
    case_id: row.case_id || null,
  });
});
```

---

### 2. Add Aggregation Helper Function (Insert after addressMap loop, around line ~865)

```typescript
// Helper function to aggregate violations for a property
function aggregateViolations(violations: Array<{
  violation_type: string | null;
  status: string;
  opened_date: string | null;
  case_id: string | null;
}>) {
  const totalCount = violations.length;

  // Count open violations (case-insensitive)
  const openCount = violations.filter(v =>
    (v.status || '').toLowerCase().trim() === 'open'
  ).length;

  // Get unique violation types
  const types = [...new Set(
    violations
      .map(v => v.violation_type)
      .filter((t): t is string => t !== null && t.trim() !== '')
  )];

  // Count unique case IDs for repeat offender detection
  const uniqueCases = new Set(
    violations
      .map(v => v.case_id)
      .filter((c): c is string => c !== null && c.trim() !== '')
  );
  const isRepeatOffender = uniqueCases.size > 1;

  // Find most recent enforcement date
  const dates = violations
    .map(v => v.opened_date)
    .filter((d): d is string => d !== null)
    .map(d => new Date(d))
    .filter(d => !isNaN(d.getTime()));

  const lastEnforcementDate = dates.length > 0
    ? new Date(Math.max(...dates.map(d => d.getTime()))).toISOString()
    : null;

  return {
    total_violations: totalCount,
    open_violations: openCount,
    violation_types: types,
    repeat_offender: isRepeatOffender,
    last_enforcement_date: lastEnforcementDate,
  };
}
```

---

### 3. Update Property Creation Logic (Line ~945-968)

**BEFORE:**
```typescript
const newProperties = newAddressEntries.map(([key, row]) => {
  // ... existing normalization code ...
  return {
    key,
    address: normalizedAddress,
    city: propertyCity,
    state: (state || '').trim().toLowerCase(),
    zip: (row.zip || '').trim(),
    county: job.county || null,
    scope: scope,
    latitude: null,
    longitude: null,
    snap_score: null,
    snap_insight: null,
    jurisdiction_id: row.jurisdiction_id,
  };
});
```

**AFTER:**
```typescript
const newProperties = newAddressEntries.map(([key, row]) => {
  // For county-scope uploads, city might be null or extracted from CSV
  const propertyCity = row.city || job.city || null;
  const state = row.state || job.state;
  const normalizedAddress = (row.address || 'Parcel-Based Location').toLowerCase().trim();

  // AGGREGATE VIOLATIONS FOR THIS PROPERTY
  const aggregates = aggregateViolations(row.violations || []);

  return {
    key, // Include key for mapping after insert
    address: normalizedAddress,
    city: propertyCity ? propertyCity.trim().toLowerCase() : 'unincorporated',
    state: (state || '').trim().toLowerCase(),
    zip: (row.zip || '').trim(),
    county: job.county || null,
    scope: scope,
    latitude: null,
    longitude: null,
    snap_score: null,
    snap_insight: null,
    jurisdiction_id: row.jurisdiction_id,
    // AGGREGATED VIOLATION DATA
    total_violations: aggregates.total_violations,
    open_violations: aggregates.open_violations,
    violation_types: aggregates.violation_types,
    repeat_offender: aggregates.repeat_offender,
    last_enforcement_date: aggregates.last_enforcement_date,
  };
});
```

---

### 4. Update Existing Properties Too (Add after property creation, around line ~1020)

After the property creation loop, we need to update EXISTING properties as well:

```typescript
console.log(`[process-upload] Property creation complete: ${propertiesCreated} created, ${dbLevelDedupes} duplicates skipped`);

// UPDATE EXISTING PROPERTIES WITH AGGREGATED VIOLATION DATA
console.log(`[process-upload] Updating ${existingMap.size} existing properties with aggregated violation data...`);
const existingAddressEntries = Array.from(addressMap.entries())
  .filter(([key]) => existingMap.has(key));

if (existingAddressEntries.length > 0) {
  const PROP_UPDATE_BATCH = 50;
  for (let i = 0; i < existingAddressEntries.length; i += PROP_UPDATE_BATCH) {
    const batch = existingAddressEntries.slice(i, i + PROP_UPDATE_BATCH);

    for (const [key, row] of batch) {
      const propertyId = existingMap.get(key);
      if (!propertyId) continue;

      // Aggregate violations for this property
      const aggregates = aggregateViolations(row.violations || []);

      // Update the property with aggregated data
      const { error: updateError } = await supabaseClient
        .from('properties')
        .update({
          total_violations: aggregates.total_violations,
          open_violations: aggregates.open_violations,
          violation_types: aggregates.violation_types,
          repeat_offender: aggregates.repeat_offender,
          last_enforcement_date: aggregates.last_enforcement_date,
          updated_at: new Date().toISOString(),
        })
        .eq('id', propertyId);

      if (updateError) {
        console.error(`[process-upload] Error updating property ${propertyId}:`, updateError);
      }
    }

    if ((i + batch.length) % 200 === 0 || i + batch.length >= existingAddressEntries.length) {
      console.log(`[process-upload] Updated ${i + batch.length}/${existingAddressEntries.length} existing properties`);
    }
  }
}
console.log(`[process-upload] ✓ Existing property updates complete`);
```

---

## Summary of Changes

1. **addressMap structure**: Now stores array of violations per address
2. **aggregateViolations()**: Helper function to calculate:
   - `total_violations`: COUNT(*)
   - `open_violations`: COUNT WHERE status='Open'
   - `violation_types`: ARRAY_AGG(DISTINCT violation_type)
   - `repeat_offender`: COUNT(DISTINCT case_id) > 1
   - `last_enforcement_date`: MAX(opened_date)

3. **Property creation**: Include aggregated fields when inserting new properties
4. **Property updates**: Update existing properties with fresh aggregates from this upload

## Filter Mapping

- **"Open Violations Only"** → `WHERE open_violations > 0`
- **"Multiple Violations"** → `WHERE total_violations > 1`
- **"Repeat Offender"** → `WHERE repeat_offender = true`
- **"Violation Type"** → `WHERE violation_types @> ARRAY['Exterior']`
- **"Last Seen"** → `WHERE last_enforcement_date >= NOW() - INTERVAL '30 days'`

## Result

After this patch:
✅ Properties have real aggregated data immediately after CSV import
✅ All filters work without needing "Generate Insights"
✅ Data stays current on every upload
✅ No manual steps required
