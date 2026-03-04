

## Plan: Lower AI Insight Threshold to 20

**One-line change** in `supabase/functions/generate-insights/index.ts`:

- Line 23: Change `SNAP_SCORE_AI_THRESHOLD = 50` to `SNAP_SCORE_AI_THRESHOLD = 20`

This means every property with a SnapScore of 20 or higher will attempt AI-generated insights. Properties scoring below 20 will use the deterministic rule-based engine. When credits run out, the function automatically falls back to rule-based for all remaining properties.

After deploying, go to `/admin` and click **"Fill Missing Insights"** to start processing.

