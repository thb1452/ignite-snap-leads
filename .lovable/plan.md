
Goal: close the privacy leak, fix empty list detail pages, and stop the mobile action bars from overlapping.

What I found
1. Saved properties bypass the blur because `src/pages/SavedProperties.tsx` renders `p.address` directly and never checks unlock state.
2. Custom lists bypass the blur for the same reason in `src/pages/ListDetail.tsx`, which renders `property.address` directly.
3. The “7 properties added” but empty list page issue is likely in the list fetch path: `src/services/lists.ts` uses `fn_get_list_properties`, then blindly casts the JSON response. If that RPC returns `success: false` or auth timing fails, the UI quietly falls back to `[]` and `0`, so the card count can say 7 while the detail page says 0.
4. The green-circled overlap is caused by two separate fixed mobile footers: `SelectionActionBar` and `BulkUnlockBar`. They are positioned independently and can sit on top of each other.

Plan

1. Enforce blur logic everywhere lists are shown
- Update `SavedProperties.tsx` to use `useUnlockedProperties` for the saved IDs shown on the page.
- Replace direct full-address rendering with the same locked-state pattern used on leads:
  - `formatBlurredStreet(...)`
  - `blur-[4px]`
  - visible city/state
  - optional lock/unlock badge for clarity
- Update `ListDetail.tsx` the same way so adding a property to any list never reveals the full address unless that property is actually unlocked.

2. Fix list detail loading so list contents actually appear
- Refactor `getListProperties()` in `src/services/lists.ts` to use a direct authenticated query pattern instead of relying on the fragile RPC path for this screen.
- Make the fetch return a real error if loading fails instead of silently pretending the list is empty.
- Keep the existing list-count logic, but make the detail view pull rows in a way that matches that count reliably.
- Ensure add-to-list/create-list invalidation refreshes the correct list detail query immediately after insertion.

3. Fix the mobile footer overlap
- Coordinate the mobile selection footer and bulk-unlock footer from `Leads.tsx` instead of letting both fixed components guess their own bottom position.
- Either:
  - stack them in one controlled bottom container, or
  - pass a dynamic bottom offset so one always sits above the other.
- Add safe bottom spacing so “Add to List” / selection actions and “Unlock X leads” are both fully clickable and never cover each other.

Files likely involved
- `src/pages/SavedProperties.tsx`
- `src/pages/ListDetail.tsx`
- `src/services/lists.ts`
- `src/hooks/useLists.ts`
- `src/pages/Leads.tsx`
- `src/components/leads/SelectionActionBar.tsx`
- `src/components/leads/BulkUnlockBar.tsx`

Technical details
- I will not change unlock/payment rules. This is a UI/data-loading fix, not a monetization change.
- The correct behavior will be:
  - hearting/saving a property does not unlock it
  - adding a property to a list does not unlock it
  - only actual unlocked properties show full addresses
  - exports/unlock flows keep working exactly as they do now

Verification after implementation
1. Heart a locked property, open Saved Properties, confirm it is still blurred.
2. Add locked properties to a new list, open that list, confirm rows appear and stay blurred.
3. Create a list with several selected properties, confirm the detail page count and visible rows match.
4. On mobile, select locked properties and confirm the bottom bars no longer overlap.
