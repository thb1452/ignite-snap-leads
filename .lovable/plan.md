

# Maximize Property List Width

## Problem
The property list cards (right side) are cramped at 55% width. The stats row ("54,000+ new enforcement actions this week", "10 Saved", "2 Lists", etc.) and the Map/List toggle eat into valuable space above the cards.

## Plan

### 1. Move stats and Map/List toggle into the existing top bar row (`src/pages/Leads.tsx`)

Move the `PersonalStatsBar` (10 Saved, 2 Lists) and `FreshnessIndicator` (54,000+ new enforcement actions) **out of the property list column** and into the always-visible top filter bar row (line ~1256). They're already partially there behind `hidden lg:flex` — make them always visible on desktop in that row. The Map/List toggle is already in that row.

This means the property list column no longer needs its own header with these stats — it only keeps the Sort dropdown and Export button.

### 2. Widen the property list from 55% to 70% (`src/pages/Leads.tsx`)

- Map: `w-[45%]` → `w-[30%]` (line 1507)
- Property list: `w-[55%]` → `w-[70%]` (line 1518)

The map at 30% still shows clusters and context. The property cards at 70% (~717px on 1025px viewport) have enough room for address, badges, AI insight, and action buttons without truncation.

### Files Changed
- `src/pages/Leads.tsx` — two width class changes + ensure stats are in the top bar only

