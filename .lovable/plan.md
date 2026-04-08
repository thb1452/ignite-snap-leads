
# Two Tasks: 4-Tier Labels + Resume AI Sweep

## Task 1: Implement 4-Tier Action Label System

Replace the current 3-label system (CALL NOW, WORTH A CALL, WATCH) with 4 distinct labels that differentiate open vs closed violations.

| Label | When | Color |
|-------|------|-------|
| **CALL NOW** | Score 70+, water shutoff, escalated, fire | Red bold |
| **WORTH A CALL** | Score 40-69, or 2+ open violations | Orange bold |
| **OPPORTUNITY** | Score < 40, still has open violations | Amber bold |
| **PASS** | All violations resolved, no active enforcement | Muted gray |

### Files to change:

**A. `src/utils/actionLabelUtils.ts`** — Core frontend label logic
- Add "OPPORTUNITY" and "PASS" as distinct label types with unique colors
- Update `createActionLabel` to support 4 labels: CALL NOW (red), WORTH A CALL (orange), OPPORTUNITY (amber/yellow), PASS (gray)
- Update `getActionLabel()` regex: map "WATCH"/"MONITOR" text → "OPPORTUNITY", keep "PASS" separate
- Update `getFallbackActionLabel()`: if `openViolations === 0` → return "PASS"
- Update `ACTION_LABEL_PRIORITY` map to include all 4 tiers
- Add "OPPORTUNITY" to all regex patterns

**B. `supabase/functions/_shared/insightSanitizer.ts`** — Backend label normalization
- Add "OPPORTUNITY" to regex patterns
- Update `normalizeActionLabel`: "WATCH"/"MONITOR" → "OPPORTUNITY", "PASS" stays "PASS"

**C. `supabase/functions/_shared/dealStrategistPrompt.ts`** — AI prompt
- Replace "WATCH" with "OPPORTUNITY" in action label rules and training examples
- Add open/closed distinction to label instructions

**D. `supabase/functions/generate-insights/index.ts`** — Deterministic engine
- In `getActionLabel()` (line 834): rename "WATCH" returns to "OPPORTUNITY"
- Keep "PASS" for `openCount === 0` cases

**E. `supabase/functions/bulk-regenerate-briefs/index.ts`** — Bulk engine
- In `getLabel()` (line 68): rename "WATCH" returns to "OPPORTUNITY"

No component changes needed — `PropertyCard`, `MobilePropertyCard`, `InvestorInsightCard`, `CompactPropertyRow` all read `actionLabel.label` and `actionLabel.colorClass` dynamically from the utility.

## Task 2: Resume AI Sweep for 188k Rule-Based Properties

The 188k rule-based properties already have `investor_insight_brief` set (model: `deterministic-v5`), so the current sweep (which filters `investor_insight_brief IS NULL`) won't pick them up.

### Approach:
- Update `bulk-regenerate-briefs/index.ts` to add a new query mode targeting properties where `investor_insight_brief->>'model' = 'deterministic-v5'` 
- Trigger a new sweep with a fresh `REGEN_VERSION` (e.g., `v29-ai-upgrade-rulebased`)
- The sweep will process these 188k properties through Azure GPT-4o, replacing rule-based one-liners with full AI insights
- The new AI prompt will already include the updated 4-tier labels (OPPORTUNITY instead of WATCH)

### Deploy order:
1. Deploy the label changes first (insightSanitizer, dealStrategistPrompt, generate-insights, bulk-regenerate-briefs)
2. Deploy the updated sweep query
3. Trigger the sweep via curl to start processing the 188k backlog
