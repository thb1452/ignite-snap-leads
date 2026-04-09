

# Plan: Add Heart/Save Button to Compact Property Cards

## Problem
The heart (save) button only appears on PropertyCard in **non-compact** (map) mode. In **compact** (list) mode, there is no heart button visible, so users have no way to save properties from the main list view.

## Changes

### File: `src/components/leads/PropertyCard.tsx`

**Compact mode (lines ~128-167):** Add a heart button next to the existing Export/Unlock buttons in the action area.

- For **unlocked** rows: Add a heart button between the Export button and the score, matching the non-compact style (small 5x5 rounded button with Heart icon).
- For **locked** rows: Add a heart button next to the Unlock button so users can save properties even before unlocking.

The button will call `onToggleSaved?.(property.id)` on click (with `e.stopPropagation()`), and display filled red when saved, outline red when not. Same pattern already used in the non-compact branch (lines 262-270).

### No other files need changes
The `isSaved` and `onToggleSaved` props are already passed through from `VirtualizedPropertyList` → `PropertyCard` with `compact={compact}`. The wiring is complete; the compact render branch simply never renders the button.

