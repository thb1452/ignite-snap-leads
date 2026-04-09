

# Fix: Header Overflow and Bottom Pagination/Action Bar Overlap

## Issues Identified

1. **Top bar overflow (circled in black)**: The row at line 1256 crams Search + Filters toggle + PersonalStatsBar + FreshnessIndicator + Map/List toggle into a single horizontal line. On 1025px viewports, the text overflows and clips behind the Map/List toggle.

2. **Bottom overlap (green circle)**: The pagination (`1/9149`) and the BulkActionBar (`Select all (50)`) are separate elements stacked vertically, but with full padding they take too much vertical space and visually collide, eating into the card list area.

## Plan

### 1. Fix the top header row overflow (`src/pages/Leads.tsx`, lines ~1256-1328)

Split the current single row into a cleaner layout:
- **Row 1** (existing): Search + Filters toggle + Clear + spacer + Map/List toggle
- Move `PersonalStatsBar` and `FreshnessIndicator` out of this row
- Place them on the same line as the AI search bar or as a slim sub-row with `overflow-hidden` and `truncate` so they never push the Map/List toggle off-screen

Alternatively, keep one row but:
- Add `overflow-hidden min-w-0` to the middle section
- Add `truncate` / `whitespace-nowrap` to PersonalStatsBar and FreshnessIndicator
- Ensure Map/List toggle has `shrink-0` (already has it)

### 2. Merge pagination into BulkActionBar (`src/pages/Leads.tsx`, lines ~1579-1621)

Instead of two separate bottom sections (pagination + BulkActionBar), combine them into one compact row:
- Move the pagination controls (prev/next + page number) into the left side of the BulkActionBar, next to the checkbox and "Select all" text
- This eliminates the separate `border-t` pagination div and saves ~30px of vertical space
- Layout: `[Checkbox ▾] Select all (50)  |  ◀ 1/9149 ▶  |  [Export CSV] [Add to List]`

### Files Changed

- `src/pages/Leads.tsx` — restructure desktop header row; move pagination into BulkActionBar area
- `src/components/leads/BulkActionBar.tsx` — accept optional pagination props (`page`, `totalPages`, `onPageChange`) and render inline

