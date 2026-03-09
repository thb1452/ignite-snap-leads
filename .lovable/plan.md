

## Add "Not For You" Column & Expand Features Grid

### 1. Add "Not For You If" column (lines 632-660)

Change the single-column layout to a **2-column grid** (`grid md:grid-cols-2`). Keep the existing green "Built For You If..." card on the left. Add a new red-tinted card on the right with these items:

- "You're happy competing for the same stale records as everyone else"
- "You prefer volume over signal"
- "You don't believe enforcement data creates early visibility"
- "You're not willing to invest in intelligence, just data"
- "You're looking for a free list service"

Style: `bg-red-500/10 border-red-500/30` with `X` icons in red.

### 2. Expand Features Grid to 8 items (lines 486-546)

Replace the current 3 cards + 3 pills layout with a **4-column responsive grid** (`grid sm:grid-cols-2 lg:grid-cols-4`). Keep the 3 existing features and add 5 more from the blueprint:

| Feature | Icon |
|---|---|
| 3,800+ Cities (existing coverage card, condensed) | Map |
| SnapScore AI (existing, condensed) | Target |
| Water Shutoff Tracking | Droplets |
| Municipal Court Dates | Scale |
| Updated Monthly | Clock |
| Violation Type Filtering | Filter |
| Export to CSV | Download |
| Real-time Alerts | Bell |

Each item: compact card with icon, title, one-line description. The SnapScore card gets a subtle highlight ring. Remove the separate pills section since those features are now in the grid.

### Files changed

- **`src/pages/Landing.tsx`** — both edits above (features grid ~lines 486-546, not-for-you ~lines 632-660). Add `Droplets`, `Scale`, `Bell` to lucide imports.

