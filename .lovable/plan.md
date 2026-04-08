

# Make Property Cards More Compact in Map View

The issue: In map view, the non-compact property cards (lines 184-287 of PropertyCard.tsx) take up too much vertical space because each card includes a full AI Brief preview section with text + action label, padded containers, and generous spacing. On the published site at full resolution, you can only see ~1-2 cards at a time in the 55% right panel.

The Lovable preview looks "nicer" because the viewport is smaller (909px), so more cards fit visually — but on a 1920px published site, the cards stretch wider and the AI brief text wraps less, yet overall card height is still too tall relative to the panel.

## Changes

**`src/components/leads/PropertyCard.tsx`** — Tighten the non-compact (map view) card layout:

1. **Collapse the AI Brief into a single inline row** instead of a boxed section with header + paragraph. Show just the action label (CALL NOW / WORTH A CALL / OPPORTUNITY / PASS) and a truncated one-line brief preview inline on the same row as the buttons — no separate bordered container, no "AI Brief" header, no multi-line text.

2. **Reduce vertical padding**: Outer wrapper from `py-1` → `py-0.5`, inner card from `py-1.5` → `py-1`. Remove `mt-0.5` gaps between rows.

3. **Merge the city/violation-types row into the first row** where address is shown, reducing from 3 rows to 2 rows total per card.

4. **Move action buttons inline** with the brief text on the second row.

**Result**: Each card goes from ~92px estimated height down to ~56-64px, fitting 3-4x more cards visible at once.

**`src/components/leads/VirtualizedPropertyList.tsx`** — Update `estimateSize` for non-compact mode from `92` → `64` to match the new card height.

No other files affected — the compact (list view) cards are already dense enough.

