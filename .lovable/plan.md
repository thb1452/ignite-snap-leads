

# Maximize Property List Height — Move Search/Filters to Map Side Only

## What you told me
- The green-circled items (Search bar, Filters button, Saved/Lists/Heating up stats) currently span the full width above both the map AND the property list, stealing vertical space from the property cards.
- You want the red box (property list) to occupy that vertical space instead.
- Hide the Saved/Lists/Heating up stats on desktop entirely.

## Changes (single file: `src/pages/Leads.tsx`)

### 1. Remove the full-width Search + Filters bar (lines 1290-1335)
The second row containing the Search input, Filters button, and PersonalStatsBar currently spans the full page width above both map and property list. Remove it from here and move the Search + Filters into the map column only.

### 2. Move Search + Filters inside the map container (line 1512)
Place the Search input and Filters button as an overlay or top bar inside the `w-[45%]` map column, so they only affect the map side. The property list column starts immediately at the top with sort/export + cards.

### 3. Hide PersonalStatsBar on desktop
Remove the `PersonalStatsBar` from the desktop filter row entirely (it stays on mobile).

### 4. In list-only view (no map), keep Search + Filters at the top
When the user switches to "List" view (full width, no map), the search/filters row will appear above the list since there's no map column.

### Result
- The property list column starts at the very top of its space — only the thin sort/export row, then cards immediately
- Gains ~60-70px of vertical space for more property cards
- Map keeps search/filters overlaid on it
- Mobile layout unchanged

