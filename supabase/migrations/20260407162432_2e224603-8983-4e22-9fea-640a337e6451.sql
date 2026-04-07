UPDATE properties 
SET last_analyzed_at = NULL 
WHERE investor_insight_brief->>'version' = 'v25-deal-strategist-p2' 
  AND investor_insight_brief->>'model' = 'deterministic-v5-fallback';