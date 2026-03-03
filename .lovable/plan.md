

## Feature Analysis: #1, #3, #8, #11

### #11 — Personal Dashboard (on Index page)
**What**: Replace the current Index dashboard stats with a personalized summary showing saved properties count, lists count, recent activity, and a "Your Top Saved" mini-list.

**Where it shows**: `src/pages/Index.tsx` — the existing dashboard already fetches `activeLists`, `tracedLeads`, `outreachToday`. We'd add a "Your Saved" stat card and a small "Top Saved Properties" section using `useSavedProperties`.

**Risk of bugs**: Very low. It's purely additive UI on an existing page using hooks that already work (`useSavedProperties`, `useUserLists`).

**Effort**: ~1-2 hours. Just adding cards and a small component to the existing Index page grid.

---

### #1 — "Heating Up" Badges on Saved Properties
**What**: When a user views their saved properties (or the property list), show a small flame/badge on properties whose `updated_at` or `newest_violation_date` changed in the last 7 days. This signals "new activity on a property you're watching."

**Where it shows**: On `PropertyCard` and `CompactPropertyRow` — a small badge like "🔥 New Activity" next to properties that have recent updates. Also on the `SavedPropertiesCard` in Lists tab showing "X properties with new activity."

**Risk of bugs**: Very low. The data already exists — `updated_at` and `newest_violation_date` are on every property row. It's just a date comparison in the UI component, no new queries or database changes needed.

**Effort**: ~1-2 hours. Add a conditional badge to `PropertyCard`, and a count query to `SavedPropertiesCard`.

---

### #3 — ZIP Code Pressure Heatmap
**What**: Add a heatmap layer to the existing Leaflet map that colors ZIP code areas by average SnapScore density — red for high-pressure ZIPs, blue for low.

**Where it shows**: `src/components/leads/LeadsMap.tsx` — there's already a `viewMode` toggle between "map" and "heatmap" (line 31). Currently the heatmap mode uses a basic `LayerGroup`. We'd replace it with a proper choropleth or circle-based heat layer aggregated by ZIP.

**Risk of bugs**: Medium. The map component is complex (365 lines) with marker clustering, viewport-based loading, and multiple layers. Adding a ZIP-aggregated heat layer requires:
- A new SQL RPC (`fn_zip_pressure`) that does `SELECT zip, AVG(snap_score), COUNT(*) FROM properties GROUP BY zip` with lat/lng averages
- Rendering colored circles sized by property count at each ZIP centroid
- The existing heatmap toggle infrastructure helps, but there could be layer conflict issues

**Effort**: ~3-4 hours. New RPC function + map layer rendering + toggle integration.

---

### #8 — Auto-Archive / "Dead Deal" Filter
**What**: Add a quick filter toggle that hides properties with `open_violations = 0` (all violations resolved). These are "dead deals" — no active enforcement pressure. The inverse toggle ("Active Only") would be the default smart view.

**Where it shows**: `src/components/leads/PressureLevelFilter.tsx` or as a new toggle in the filter bar. Could also be a banner: "Hiding X resolved properties. Show all?"

**Risk of bugs**: Low. The `open_violations` column already exists and is indexed. The `fn_properties_paged` RPC already supports `p_open_violations_only`. This is mostly a UI toggle that sets `openViolationsOnly: true` as default behavior.

**Effort**: ~1 hour. Add a toggle/chip to the filter bar, possibly default it to on.

---

### Recommended Build Order

1. **#8 — Dead Deal Filter** (~1 hr) — Fastest win, immediately improves data quality users see
2. **#11 — Personal Dashboard** (~1-2 hrs) — Makes the home page feel personalized
3. **#1 — Heating Up Badges** (~1-2 hrs) — Adds intelligence feel to property cards
4. **#3 — ZIP Heatmap** (~3-4 hrs) — Most complex, but biggest visual impact

Total estimated time: ~6-9 hours across all four features. No database schema changes needed for #1, #8, or #11. Only #3 requires a new SQL function.

