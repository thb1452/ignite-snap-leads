

## Plan: Fly-to-selected-property in LeadsMap

### What changes

**File: `src/components/leads/LeadsMap.tsx`** — Add one `useEffect` (~30 lines) after the existing marker-rendering effect:

1. **Watch `selectedPropertyId`** — when it changes to a non-null value:
   - Search `markers` array for a match by ID to get lat/lng
   - If not found (property outside viewport), do a single-row fetch: `supabase.from('properties').select('latitude, longitude').eq('id', selectedPropertyId).single()`
   - Call `mapRef.current.flyTo([lat, lng], 16)` to smoothly pan/zoom

2. **Visual highlight** — add a pulsing ring marker around the selected property:
   - Store a `highlightRef = useRef<L.CircleMarker | null>(null)`
   - On selection, remove previous highlight, create a new `L.circleMarker` with larger radius (14), a bright border (white + colored ring), and add it to the map at high z-index
   - Clear highlight when `selectedPropertyId` becomes null

3. **No other files change** — no database migration, no new hooks. The `properties` table already has `latitude`/`longitude` columns accessible to authenticated users.

### Why this is safe
- `flyTo` triggers `moveend`, which naturally reloads viewport markers — the selected property will appear in the marker set
- The single-row DB fallback only fires when the property isn't already in the viewport cache
- The highlight marker is independent of the cluster group, so it persists through re-renders

