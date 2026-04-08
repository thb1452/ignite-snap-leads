

# Show 3-Line AI Brief on Map View Property Cards

The insight is the product — currently it's truncated to 1 sentence on 1 line. This change expands it to 3 sentences across up to 3 visible lines.

## Changes

**`src/components/leads/PropertyCard.tsx`**

1. Update `getBriefPreview` call (line 72): change `maxSentences` from `1` to `3` and `maxChars` from `132` to `280` for non-compact mode:
   ```
   getBriefPreview(insightText, compact ? 1 : 3, compact ? 96 : 280)
   ```

2. In the map view card (line 232), change the brief `<p>` from single-line `truncate` to multi-line clamp:
   - Remove `truncate`
   - Add `line-clamp-3 whitespace-normal` so it wraps up to 3 lines
   - Bump font slightly from `text-[10px]` to `text-[11px]` with `text-slate-300` (higher contrast since this is the product)

3. Restructure Row 2: Move the action label + brief preview into their own block that spans below Row 1, with buttons staying right-aligned. This lets the brief text use the full card width instead of competing with buttons on the same line.

**`src/components/leads/VirtualizedPropertyList.tsx`**

- Update `estimateSize` for non-compact mode from `64` to `100` to accommodate the 3-line brief.

