
# Fix state filters and make PASS more obvious

## What I found
The main problem is not just slowness: the Leads list request is failing at the backend RPC layer.

From the current console logs:
- `fn_properties_paged` is ambiguous (`PGRST203`)
- there are two overloaded versions of the same function still visible to the API
- because of that, property fetches can fail before filtered results ever load
- this makes state filters look broken or extremely slow

I also confirmed:
- the state filter UI is wired correctly in `Leads.tsx`
- the selected state is passed into `buildFiltersFromState(...)`
- `fetchPropertiesPaged(...)` sends `p_state`
- the PASS label is already slightly emphasized in `src/utils/actionLabelUtils.ts`, but it is still too subtle in the card layout

## Plan

### 1. Fix the backend function ambiguity
Create a migration that removes the conflicting `fn_properties_paged` overload(s) so only one API-visible signature remains.

This is the highest-priority fix because until it is resolved:
- all property loads can fail intermittently
- state filters will continue to appear broken
- the page may show “No properties found” even when data exists

### 2. Recreate the canonical property query function cleanly
In the same migration, recreate a single canonical `fn_properties_paged` definition with:
- one stable parameter order
- support for `p_last_seen_days`
- support for pressure-level flags
- the existing faster state/city matching logic

This avoids future ambiguity and makes the RPC contract explicit.

### 3. Verify related filter RPCs stay aligned
Review and, if needed, refresh:
- `fn_distinct_cities`
- `fn_category_property_counts`

Goal:
- state dropdown still populates correctly
- city options still narrow by selected state
- signal/category counts stay consistent with filtered results

### 4. Improve the user-facing error state on the Leads page
Update the Leads error handling so RPC failures do not look like “empty results.”

Change the desktop/mobile empty state behavior to distinguish:
- loading
- real zero-result filter states
- backend query failure

This will make debugging and user trust much better.

### 5. Make PASS much more visually obvious
Adjust the property-card presentation so PASS stands out clearly, not just as faint text.

Recommended update:
- stronger contrast color
- visible badge/pill treatment instead of only text color
- consistent styling in both compact and regular property cards

## Files likely involved
- `src/services/properties.ts`
- `src/pages/Leads.tsx`
- `src/components/leads/PropertyCard.tsx`
- `src/utils/actionLabelUtils.ts`
- `supabase/migrations/...`

## Expected result
After this:
- selecting a state like `AK` should return results normally when data exists
- filter responses should no longer fail because of RPC ambiguity
- users will see a proper error state if the backend query fails
- PASS will be clearly visible on cards

## Technical notes
Root cause from logs:
```text
Could not choose the best candidate function between:
public.fn_properties_paged(... p_sort_by ..., p_last_seen_days ..., p_random_seed ...)
and
public.fn_properties_paged(... p_last_seen_days ..., p_sort_by ..., p_random_seed ...)
```

So the fix is primarily a database-function cleanup, not a React state bug.

<lov-actions>
<lov-suggestion message="Test the state filter end-to-end on the Leads page after the fix, including AK and a few higher-volume states, to make sure results load correctly">Verify filter behavior</lov-suggestion>
<lov-suggestion message="Implement the approved fix: remove the conflicting fn_properties_paged overload, recreate one canonical function, improve the Leads error state, and make PASS a stronger badge in property cards">Apply the filter fix</lov-suggestion>
<lov-suggestion message="Add a visible inline loading and error status near the filters so users can tell whether the page is loading, failed, or truly has zero results">Improve filter feedback</lov-suggestion>
</lov-actions>
