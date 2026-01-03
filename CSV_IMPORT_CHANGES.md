# CSV Import Aggregation Changes

## File: `supabase/functions/process-upload/index.ts`

### Change 1: Update addressMap Structure (Line 828-863)

**Replace:**
```typescript
const addressMap = new Map<string, any>();
```

**With:**
```typescript
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
```

**And replace (lines 855-863):**
```typescript
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
```

**With:**
```typescript
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

// Add this violation to the property's violation list
const addressData = addressMap.get(key)!;
addressData.violations.push({
  violation_type: row.violation_type || null,
  status: row.status || 'Open',
  opened_date: row.opened_date || null,
  case_id: row.case_id || null,
});
```

---

### Change 2: Add Aggregation Helper Function (Insert after line 864)

**Insert this function:**
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

### Change 3: Update Property Creation with Aggregates (Around line 945-968)

**Replace:**
```typescript
const newProperties = newAddressEntries.map(([key, row]) => {
  // For county-scope uploads, city might be null or extracted from CSV
  const propertyCity = row.city || job.city || null;
  const state = row.state || job.state;

  // IMPORTANT: Normalize address to lowercase for consistent matching
  // This matches the database functional index which uses LOWER(TRIM(...))
  const normalizedAddress = (row.address || 'Parcel-Based Location').toLowerCase().trim();

  return {
    key, // Include key for mapping after insert
    address: normalizedAddress,
    city: propertyCity ? propertyCity.trim().toLowerCase() : 'unincorporated', // Use 'unincorporated' for county-scope with no city (lowercase for consistency)
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

**With:**
```typescript
const newProperties = newAddressEntries.map(([key, row]) => {
  // For county-scope uploads, city might be null or extracted from CSV
  const propertyCity = row.city || job.city || null;
  const state = row.state || job.state;

  // IMPORTANT: Normalize address to lowercase for consistent matching
  // This matches the database functional index which uses LOWER(TRIM(...))
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

### Change 4: Update Existing Properties (Insert after line 1020)

**Insert after the property creation complete log:**
```typescript
console.log(`[process-upload] Property creation complete: ${propertiesCreated} created, ${dbLevelDedupes} duplicates skipped`);

// UPDATE EXISTING PROPERTIES WITH AGGREGATED VIOLATION DATA
console.log(`[process-upload] Updating ${existingMap.size} existing properties with aggregated violation data...`);
const existingAddressEntries = Array.from(addressMap.entries())
  .filter(([key]) => existingMap.has(key));

if (existingAddressEntries.length > 0) {
  const PROP_UPDATE_BATCH = 50;
  let updatedCount = 0;

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
      } else {
        updatedCount++;
      }
    }

    if ((i + batch.length) % 200 === 0 || i + batch.length >= existingAddressEntries.length) {
      console.log(`[process-upload] Updated ${i + batch.length}/${existingAddressEntries.length} existing properties`);
    }
  }

  console.log(`[process-upload] ✓ Existing property updates complete: ${updatedCount} properties updated`);
}
```

---

## Summary of Changes

1. **addressMap structure**: Now stores array of violations per address
2. **aggregateViolations()**: Helper function calculates all aggregates
3. **Property creation**: Includes aggregated fields in INSERT
4. **Property updates**: Updates existing properties with fresh aggregates

## Testing Checklist

Before applying to production:
- [ ] Test with sample CSV (10-100 rows)
- [ ] Verify aggregates match manual calculation
- [ ] Check that filters work on newly imported properties
- [ ] Confirm no TypeScript errors
- [ ] Test with county-scope CSV
- [ ] Test with city-scope CSV
