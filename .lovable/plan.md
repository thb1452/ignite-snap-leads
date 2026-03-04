

## City Name Audit — Census-Validated Cleanup

### The Problem

Your `properties` table has **3,674 distinct city names** across **461,217 properties**. A regex scan already reveals obvious garbage:
- Sentences stored as cities: "It Is Less Than 900 Square Foot", "Rotted Soffits And Siding On Garage", "This Is On Going Not One Day."
- Street addresses parsed into city field: "Feather River Boulevard West Linda", "Lost Trail Drive Plumas Lake"
- County names instead of cities: "Fairfax County" (1,369 rows), "unincorporated sacramento county" (488 rows), "Broward County" (229 rows)
- Concatenated address fragments: "N Martin Luther King Jr Dr G Winston-Salem"

The regex-based filter in `LocationFilter.tsx` catches some of these client-side, but the bad data still lives in the database and pollutes filters, maps, and scoring.

### The Approach: Census Places API

The US Census Bureau provides a **free, no-API-key** endpoint that returns every recognized place (city, town, village, CDP) per state:

```
https://api.census.gov/data/2020/dec/pl?get=NAME&for=place:*&in=state:XX
```

This returns thousands of legitimate place names per state. We can use this as the authoritative source.

### Implementation Plan

**1. Create a `census_places` reference table**

A lightweight lookup table (~30k rows covering all US states):

```sql
CREATE TABLE census_places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,        -- "Baltimore", "San Antonio"
  state_fips text NOT NULL,  -- "24", "48"
  state_abbr text NOT NULL,  -- "MD", "TX"
  place_fips text NOT NULL,
  UNIQUE(name, state_abbr)
);
```

**2. Build an edge function `audit-cities`** that:
- Fetches all Census places for each state present in your data (free, no key needed)
- Populates `census_places` table
- Runs a comparison query: all distinct `(city, state)` pairs from `properties` that do NOT fuzzy-match any Census place
- Returns a report of unmatched cities with property counts

**3. Build an admin UI panel** ("City Audit" card on Admin Console) showing:
- Total cities checked vs. verified vs. flagged
- Table of flagged cities with property count, suggested fix (closest Census match), and a "Fix" button
- Bulk action to null out or remap garbage city names

**4. Create a cleanup RPC** `fn_fix_city_names` that:
- Accepts an array of `{old_city, old_state, new_city}` mappings
- Updates matching properties in bulk
- Logs changes for audit trail

### Matching Strategy

Exact match won't catch casing differences ("BALTIMORE" vs "Baltimore") or minor variations. The comparison will:
1. Normalize both sides: `UPPER(TRIM(name))`
2. For non-matches, compute similarity using `pg_trgm` (already available in most Supabase instances) to suggest the closest real city
3. Flag anything with no match above 0.4 similarity as "garbage" (likely a sentence or address fragment)

### Scope

- ~3,674 distinct cities to validate
- Census API calls: ~50 state-level requests (free, no rate limit concerns)
- Expected outcome: identify and fix/remove the ~50-100 invalid city entries affecting ~2,000+ property rows

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/audit-cities/index.ts` | New edge function: fetch Census places, compare, return report |
| Migration | Create `census_places` table + `fn_fix_city_names` RPC |
| `src/components/admin/CityAuditDashboard.tsx` | New admin panel showing flagged cities with fix actions |
| `src/pages/AdminConsole.tsx` | Add CityAuditDashboard to admin page |

