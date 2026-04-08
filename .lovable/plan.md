

# Two Tasks: 4-Tier Labels + Resume AI Sweep for 188k Properties

## Task 1: Implement 4-Tier Action Label System

Replaces the current 3-label system with 4 distinct labels that differentiate open vs closed violations.

| Label | When | Color |
|-------|------|-------|
| **CALL NOW** | Score 70+, water shutoff, escalated, fire | Red bold |
| **WORTH A CALL** | Score 40-69, or 2+ open violations | Orange bold |
| **OPPORTUNITY** | Score < 40, still has open violations | Amber/yellow bold |
| **PASS** | All violations resolved, no active enforcement | Muted gray |

### Files changed (frontend):

**`src/utils/actionLabelUtils.ts`** — Core label logic
- Add "OPPORTUNITY" and "PASS" as distinct labels with unique color classes
- Map existing "WATCH"/"MONITOR" text in insights → display as "OPPORTUNITY"
- Keep "PASS" as its own label (stop collapsing into WATCH)
- Update `getFallbackActionLabel()`: `openViolations === 0` → PASS
- Add "OPPORTUNITY" to all regex patterns
- Update priority map for all 4 tiers

No component files need changing — PropertyCard, MobilePropertyCard, InvestorInsightCard, CompactPropertyRow all read label/color dynamically from this utility.

### Files changed (backend):

**`supabase/functions/_shared/insightSanitizer.ts`** — Add "OPPORTUNITY" to regex and normalization
**`supabase/functions/_shared/dealStrategistPrompt.ts`** — Update AI prompt with 4-tier rules (OPPORTUNITY replaces WATCH)
**`supabase/functions/generate-insights/index.ts`** — Deterministic engine: rename WATCH → OPPORTUNITY
**`supabase/functions/bulk-regenerate-briefs/index.ts`** — Bulk engine: rename WATCH → OPPORTUNITY in `getLabel()`

---

## Task 2: Resume AI Sweep for 188k Rule-Based Properties

The 188k rule-based properties already have `investor_insight_brief` set (`model: "deterministic-v5"`), so the current sweep query (`investor_insight_brief IS NULL`) skips them.

**Fix:** Update `bulk-regenerate-briefs` to target properties where the brief model is `deterministic-v5` instead of only NULL briefs. Bump `REGEN_VERSION` to `v29-ai-upgrade-rulebased`. Trigger the sweep after deploying.

### Deploy order:
1. Deploy all label changes + updated sweep query
2. Trigger sweep via curl to start AI processing of 188k backlog
3. New insights will use the updated 4-tier labels automatically

**Estimated time:** ~10 minutes for code changes + deploy. The AI sweep itself runs in background over several hours.

