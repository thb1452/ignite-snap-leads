/**
 * Bulk Generate Missing Insights - Fast server-side batch processing
 * 
 * ONLY processes properties that are MISSING insights (snap_insight IS NULL).
 * Uses parallel processing for speed. Self-continues until complete.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Process 200 properties per batch (4x faster than before)
const BATCH_SIZE = 200;

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

    // Count ONLY properties missing insights
    const { count: totalMissing } = await supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .is("snap_insight", null);

    console.log(`[bulk-missing] Starting at offset ${offset}, total missing: ${totalMissing}`);

    // Fetch batch of properties MISSING insights
    // Priority ordering: high snap_score first, then by id for consistency
    const { data: properties, error: fetchError } = await supabase
      .from("properties")
      .select("id, snap_score")
      .is("snap_insight", null)
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
          message: "All missing insights generated!",
          processed: offset,
          total: totalMissing,
          complete: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const propertyIds = properties.map(p => p.id);
    const scores = properties.map(p => p.snap_score ?? 0);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const maxScore = scores.length > 0 ? Math.max(...scores) : 0;
    console.log(`[bulk-missing] Processing ${propertyIds.length} properties (offset ${offset})`);
    console.log(`[bulk-missing] Priority batch: max_score=${maxScore}, avg_score=${avgScore} (high-value first)`);

    // Split into smaller chunks for parallel processing (50 each)
    const CHUNK_SIZE = 50;
    const chunks: string[][] = [];
    for (let i = 0; i < propertyIds.length; i += CHUNK_SIZE) {
      chunks.push(propertyIds.slice(i, i + CHUNK_SIZE));
    }

    let totalProcessed = 0;
    let totalAI = 0;
    let totalRuleBased = 0;

    if (!dryRun) {
      // Process chunks in parallel (up to 4 concurrent)
      const results = await Promise.allSettled(
        chunks.map(async (chunk) => {
          try {
            const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-insights`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({ propertyIds: chunk }),
            });
            
            if (response.ok) {
              const result = await response.json();
              return {
                processed: result.processed || 0,
                ai: result.breakdown?.ai_generated || 0,
                rule: result.breakdown?.rule_based || 0,
              };
            } else {
              console.error(`[bulk-missing] Chunk failed: ${await response.text()}`);
              return { processed: 0, ai: 0, rule: 0 };
            }
          } catch (err) {
            console.error(`[bulk-missing] Chunk error:`, err);
            return { processed: 0, ai: 0, rule: 0 };
          }
        })
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          totalProcessed += result.value.processed;
          totalAI += result.value.ai;
          totalRuleBased += result.value.rule;
        }
      }
    }

    const elapsed = Date.now() - startTime;
    const nextOffset = offset + BATCH_SIZE;
    const isComplete = nextOffset >= (totalMissing || 0);
    const progress = Math.round((nextOffset / (totalMissing || 1)) * 100);

    console.log(`[bulk-missing] Batch complete: ${totalProcessed} processed in ${elapsed}ms`);
    console.log(`[bulk-missing] Progress: ${Math.min(100, progress)}% (${Math.min(nextOffset, totalMissing || 0)}/${totalMissing})`);

    // Auto-continue if enabled and not complete
    if (!isComplete && !dryRun && autoResume) {
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const selfUrl = `${SUPABASE_URL}/functions/v1/bulk-generate-missing-insights`;
      fetch(selfUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ offset: nextOffset, autoResume }),
      }).catch(err => console.error('[bulk-missing] Failed to trigger next batch:', err));
      
      console.log(`[bulk-missing] Auto-triggered next batch at offset ${nextOffset}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: totalProcessed,
        ai_generated: totalAI,
        rule_based: totalRuleBased,
        elapsed_ms: elapsed,
        progress: {
          current: Math.min(nextOffset, totalMissing || 0),
          total: totalMissing,
          percentage: Math.min(100, progress),
          complete: isComplete
        },
        next_offset: isComplete ? null : nextOffset,
        auto_continuing: !isComplete && !dryRun && autoResume
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("[bulk-missing] Fatal error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
