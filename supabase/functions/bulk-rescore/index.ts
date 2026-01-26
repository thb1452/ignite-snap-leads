/**
 * Bulk Rescore - Server-side batch processing for all properties
 * 
 * Processes ALL properties with AI-powered insights and new scoring algorithm.
 * Runs entirely server-side - no browser connection needed.
 * 
 * Usage: Call once to start, it will process in chunks and self-continue.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 50; // Smaller batch for AI processing (slower but includes AI insights)

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const { offset = 0, dryRun = false } = await req.json().catch(() => ({}));

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required environment variables");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get total count for progress tracking
    const { count: totalCount } = await supabase
      .from("properties")
      .select("id", { count: "exact", head: true });

    console.log(`[bulk-rescore] Starting at offset ${offset}, total properties: ${totalCount}`);

    // Fetch batch of properties that haven't been analyzed recently or are missing insights
    const { data: properties, error: fetchError } = await supabase
      .from("properties")
      .select("id")
      .order("id")
      .range(offset, offset + BATCH_SIZE - 1);

    if (fetchError) {
      throw fetchError;
    }

    if (!properties || properties.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "All properties processed!",
          processed: offset,
          total: totalCount,
          complete: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const propertyIds = properties.map(p => p.id);
    console.log(`[bulk-rescore] Processing ${propertyIds.length} properties with AI insights (${offset + 1} to ${offset + propertyIds.length})`);

    // Call the generate-insights function which does AI processing
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
          console.log(`[bulk-rescore] AI insights: ${insightResult.ai_generated} AI, ${insightResult.rule_based} rule-based`);
        } else {
          const errorText = await insightResponse.text();
          console.error(`[bulk-rescore] generate-insights failed: ${errorText}`);
        }
      } catch (insightError) {
        console.error(`[bulk-rescore] Error calling generate-insights:`, insightError);
      }
    }

    const elapsed = Date.now() - startTime;
    const nextOffset = offset + BATCH_SIZE;
    const isComplete = nextOffset >= (totalCount || 0);
    const progress = Math.round((nextOffset / (totalCount || 1)) * 100);

    console.log(`[bulk-rescore] Batch complete: ${insightResult.processed} processed in ${elapsed}ms`);
    console.log(`[bulk-rescore] Progress: ${progress}% (${nextOffset}/${totalCount})`);

    // Auto-continue enabled for full batch processing
    const autoResume = true;
    
    if (!isComplete && !dryRun && autoResume) {
      // Small delay to avoid overwhelming the AI API
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const selfUrl = `${SUPABASE_URL}/functions/v1/bulk-rescore`;
      fetch(selfUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ offset: nextOffset }),
      }).catch(err => console.error('[bulk-rescore] Failed to trigger next batch:', err));
      
      console.log(`[bulk-rescore] Auto-triggered next batch at offset ${nextOffset}`);
    } else if (!isComplete && !autoResume) {
      console.log(`[bulk-rescore] PAUSED - auto-continue disabled. Resume by setting autoResume = true`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: insightResult.processed,
        ai_generated: insightResult.ai_generated,
        rule_based: insightResult.rule_based,
        elapsed_ms: elapsed,
        progress: {
          current: nextOffset,
          total: totalCount,
          percentage: Math.min(100, progress),
          complete: isComplete
        },
        next_offset: isComplete ? null : nextOffset,
        auto_continuing: !isComplete && !dryRun
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("[bulk-rescore] Fatal error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

