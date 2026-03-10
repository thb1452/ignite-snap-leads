

# Fix: "Recently Updated" Sort Bug on Properties Page

## Current Problem

The "Recently Updated" sort orders by `properties.updated_at` — the timestamp when the property **record** was last modified in the database (e.g., during bulk imports, score recalculations, backfills). This is why yesterday's upload pushed those properties to the top regardless of their actual violation dates.

It should order by **most recent violation activity** — specifically `newest_violation_date`, which already exists on the properties table and tracks the latest violation filed/updated date.

## What Exists Today

| Sort Option | Label | Sorts By | Correct? |
|---|---|---|---|
| `recently_updated` | Recently Updated | `properties.updated_at` | No — shows DB record changes |
| `newest_violation` | Newest Violations | `properties.newest_violation_date` | Yes |

Both options should be violation-date based. Since `recently_updated` should actually sort by violation dates, it becomes functionally identical to `newest_violation`.

## Plan

**Consolidate into one sort option** and rename for clarity:

1. **Rename** "Recently Updated" to **"Recent Violations"** in `SortByDropdown.tsx` and `MobileFilterSheet.tsx`
2. **Update the SQL function** `fn_properties_paged`: change the `recently_updated` ORDER BY from `p.updated_at` to `p.newest_violation_date` so both sort keys produce the same correct result
3. **Update `fn_properties_by_category`**: add `p_sort_by` parameter support (currently ignores sorting entirely — always sorts by snap_score)
4. **Update the legacy path** in `properties.ts`: change fallback sort from `updated_at` to `newest_violation_date`

### Files to Change

| File | Change |
|---|---|
| `fn_properties_paged` (new migration) | Change `recently_updated` ORDER BY from `p.updated_at` to `p.newest_violation_date` |
| `fn_properties_by_category` (new migration) | Add `p_sort_by` param, apply same ORDER BY logic |
| `src/components/leads/SortByDropdown.tsx` | Rename "Recently Updated" → "Recent Violations" |
| `src/components/leads/MobileFilterSheet.tsx` | Rename "Recently Updated" → "Recent Violations" |
| `src/services/properties.ts` | Change legacy fallback sort to `newest_violation_date` |

