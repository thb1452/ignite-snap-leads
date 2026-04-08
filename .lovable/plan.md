

# Update AI Search Example Chips to Match High-Volume Data

The current example chips reference queries that may return small or zero results. Update them to match the actual top data in the database.

## Data Findings

| State | Properties |
|-------|-----------|
| TX | 89,576 |
| FL | 80,010 |
| CA | 52,488 |
| OH | 42,941 |

Top cities: Cleveland (23K), Baltimore (22K), San Antonio (7K), Houston (7K)

Score 80+: ~12K properties. Open violations in TX: ~44K.

## Change

**`src/components/leads/AiSearchBar.tsx`** — Update the `EXAMPLE_CHIPS` array:

```typescript
// FROM:
"Open violations in Florida",
"Repeat offenders score 80+",
"Structural issues last 30 days",
"Multiple violations in Texas",

// TO:
"Open violations in Texas",
"High scores in Florida",
"Properties in Cleveland OH",
"Recently updated in California",
```

These map to the highest-volume states and cities in the database, so users will always see meaningful results when clicking them.

