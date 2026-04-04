

# Fix Action Label Display Across All Property Cards

## Problem
The `PropertyCard` component (used in the main leads view) collapses all high-tier labels (HIGH OPPORTUNITY, GOOD OPPORTUNITY) into "CALL NOW". The new system prompt generates distinct labels per score tier, and they should display as written — at the end of the brief text.

## Changes

### 1. Update `PropertyCard.tsx` — Fix `getActionLabel` to preserve distinct labels

Current (wrong):
```
CALL NOW | HIGH OPPORTUNITY | GOOD OPPORTUNITY → all display as "CALL NOW"
```

Updated (correct):
- `CALL NOW` → red, "CALL NOW"
- `HIGH OPPORTUNITY` → red, "HIGH OPPORTUNITY"  
- `GOOD OPPORTUNITY` → orange, "GOOD OPPORTUNITY"
- `WORTH A CALL` → orange, "WORTH A CALL"
- `WATCH` → gray, "WATCH"
- `PASS` → gray, "PASS"

Also add `PASS` to the regex (currently missing from PropertyCard).

### 2. Confirm label renders at the END of brief text (already correct)

Both `PropertyCard` (line 151-154) and `InvestorInsightCard` already render the action label after the brief body text. No structural change needed — just the label mapping fix above.

### Files Modified
- `src/components/leads/PropertyCard.tsx` — Update `getActionLabel` and `stripActionLabel` to match `InvestorInsightCard`'s version with all 6 distinct labels

