

## Plan: Update Landing Page — Remove "leads" references and fix data freshness to "monthly"

### Changes needed in `src/pages/Landing.tsx`:

1. **Line 392** — "chase more leads" → "chase more records"
2. **Line 530** — "tracks escalation patterns weekly" → "tracks escalation patterns monthly"
3. **Line 612** — "chasing stale leads" → "chasing stale records"
4. **Line 679** — "BatchLeads" → "BatchData, similar tools" (or keep as product name since it's a competitor reference)
5. **Line 742** — "Weekly data refresh" → "Monthly data refresh"
6. **Line 882** — "Weekly data refresh" → "Monthly data refresh"
7. **Line 1033** — "We update weekly." → "We update monthly."

All changes are in a single file, straightforward text replacements.

