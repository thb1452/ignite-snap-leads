

# Move Stats & Toggle to Top Bar for More Property List Height

## Problem
The "54,000+ new enforcement actions" stat and "Map / List" toggle sit in the filter controls row (line 1256-1330), taking up vertical space above the property list. Users only see 2-3 properties before scrolling.

## Changes (single file: `src/pages/Leads.tsx`)

### 1. Add FreshnessIndicator and Map/List toggle to the AiSearchBar row
After the `<AiSearchBar>` component (line 1254), add a small wrapper row that places the FreshnessIndicator and Map/List toggle inline, right-aligned next to the search bar area. This puts them in the top section that's already outside the scrollable property area.

### 2. Remove them from the filter controls row
- **Lines 1298-1301**: Remove the `PersonalStatsBar` + `FreshnessIndicator` block (keep `PersonalStatsBar` where it is since user didn't mention it).
- **Lines 1303-1329**: Remove the Map/List toggle from this row.

This eliminates ~32px of vertical height from the bar above the property list, letting the list expand to fill that space and show more properties.

### What stays the same
- Map width and position: unchanged
- Property list width: unchanged (55% in map view, 100% in list view)
- All filter functionality: unchanged
- PersonalStatsBar (10 Saved, 2 Lists): stays in the filter controls row
- Mobile layout: unchanged

