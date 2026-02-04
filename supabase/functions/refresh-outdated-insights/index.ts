/**
 * Refresh Outdated Insights - Server-side batch processing for properties with investor language
 * 
 * Targets ONLY properties with outdated investor-focused language and regenerates
 * their insights using the new compliance/enforcement-focused prompts.
 * 
 * Runs entirely server-side with auto-continue.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 50;

// Outdated investor-focused terms to detect (comprehensive list)
const OUTDATED_TERMS = [
  // Investment/acquisition language
  'opportunity', 'acquisition', 'value-add', 'value add',
  'investor', 'deal', 'upside', 'profit', 'financial strain',
  'financial pressure', 'buying', 'purchase',
  // Distress/motivation language
  'distress', 'motivated', 'discounted', 'below market',
  // Wholesaling language
  'wholesale', 'flip', 'flipping', 'arv', 'rehab',
  // Persuasion language
  'great opportunity', 'prime candidate', 'ideal for',
  'perfect for', 'excellent', 'strong potential'
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const { offset = 0, dryRun = false, autoResume = true } = await req.json().catch(() => ({}));

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required environment variables");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Build the OR condition for outdated terms
    const orConditions = OUTDATED_TERMS.map(term => `snap_insight.ilike.%${term}%`).join(',');

    // Get total count of outdated properties
    const { count: totalCount } = await supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .not("snap_insight", "is", null)
      .or(orConditions);

    console.log(`[refresh-outdated] Starting at offset ${offset}, total outdated: ${totalCount}`);

    // Fetch batch of properties with outdated language
    // Priority ordering: high snap_score first so valuable properties get fixed first
    const { data: properties, error: fetchError } = await supabase
      .from("properties")
      .select("id, snap_score")
      .not("snap_insight", "is", null)
      .or(orConditions)
      .order("snap_score", { ascending: false, nullsFirst: false })
      .order("id")
      .range(offset, offset + BATCH_SIZE - 1);

    if (fetchError) {
      throw fetchError;
    }

    if (!properties || properties.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "All outdated insights refreshed!",
          processed: offset,
          total: totalCount,
          complete: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const propertyIds = properties.map(p => p.id);
    const scores = properties.map(p => p.snap_score ?? 0);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const maxScore = scores.length > 0 ? Math.max(...scores) : 0;
    console.log(`[refresh-outdated] Processing ${propertyIds.length} properties (offset ${offset})`);
    console.log(`[refresh-outdated] Priority batch: max_score=${maxScore}, avg_score=${avgScore} (high-value first)`);

    // Call the generate-insights function
    let insightResult = { processed: 0, ai_generated: 0, rule_based: 0 };
    
    if (!dryRun) {
      try {
        const insightResponse = await fetch(`${SUPABASE_URL}/functions/v1/generate-insights`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ propertyIds }),
        });
        
        if (insightResponse.ok) {
          const result = await insightResponse.json();
          insightResult = {
            processed: result.processed || 0,
            ai_generated: result.breakdown?.ai_generated || 0,
            rule_based: result.breakdown?.rule_based || 0,
          };
          console.log(`[refresh-outdated] Processed: ${insightResult.ai_generated} AI, ${insightResult.rule_based} rule-based`);
        } else {
          const errorText = await insightResponse.text();
          console.error(`[refresh-outdated] generate-insights failed: ${errorText}`);
        }
      } catch (insightError) {
        console.error(`[refresh-outdated] Error calling generate-insights:`, insightError);
      }
    }

    const elapsed = Date.now() - startTime;
    const nextOffset = offset + BATCH_SIZE;
    const isComplete = nextOffset >= (totalCount || 0);
    const progress = Math.round((nextOffset / (totalCount || 1)) * 100);

    console.log(`[refresh-outdated] Batch complete: ${insightResult.processed} processed in ${elapsed}ms`);
    console.log(`[refresh-outdated] Progress: ${progress}% (${nextOffset}/${totalCount})`);

    // Auto-continue if enabled and not complete
    if (!isComplete && !dryRun && autoResume) {
      // Small delay to avoid overwhelming the AI API
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const selfUrl = `${SUPABASE_URL}/functions/v1/refresh-outdated-insights`;
      fetch(selfUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ offset: nextOffset, autoResume }),
      }).catch(err => console.error('[refresh-outdated] Failed to trigger next batch:', err));
      
      console.log(`[refresh-outdated] Auto-triggered next batch at offset ${nextOffset}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: insightResult.processed,
        ai_generated: insightResult.ai_generated,
        rule_based: insightResult.rule_based,
        elapsed_ms: elapsed,
        progress: {
          current: Math.min(nextOffset, totalCount || 0),
          total: totalCount,
          percentage: Math.min(100, progress),
          complete: isComplete
        },
        next_offset: isComplete ? null : nextOffset,
        auto_continuing: !isComplete && !dryRun && autoResume
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("[refresh-outdated] Fatal error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
