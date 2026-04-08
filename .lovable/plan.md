

# Swap Investor Brief above Metrics Grid

Simple layout reorder in `PropertyDetailPanel.tsx` — move the InvestorInsightCard block (lines 282-298) above the PropertyMetricsGrid block (lines 263-280).

### Change

**`src/components/leads/PropertyDetailPanel.tsx`** (single edit)

Swap the two `<motion.div>` blocks so the order becomes:
1. **AI Investor Brief** (currently second) — moves to top of scrollable content
2. **Metrics Grid** (SnapScore, Intensity, Active, Duration) — moves below the brief

No other files affected. The animation delays will be adjusted so the brief animates first (0.03) and metrics second (0.04).

