import { internalWorkerDenial } from "../_shared/internalWorkerAuth.ts";
/**
 * Backfill Property Aggregates (v3 - Parallel Processing)
 *
 * Uses parallel batch processing for maximum speed.
 * Processes multiple batches concurrently for ~5x throughput.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface BackfillRequest {
  batchSize?: number;
  concurrency?: number; // Number of parallel batches
  autoResume?: boolean;
  maxCycles?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const denial = internalWorkerDenial(req, corsHeaders);
  if (denial) return denial;

  try {
    const {
      batchSize = 200,
      concurrency = 5, // Run 5 batches in parallel = 1000 properties per cycle
      autoResume = false,
      maxCycles = 1,
    }: BackfillRequest = await req.json().catch(() => ({}));

    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500 ||
        !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 5 ||
        typeof autoResume !== "boolean" || !Number.isInteger(maxCycles) || maxCycles < 1 || maxCycles > 10) {
      return new Response(JSON.stringify({ error: "invalid_batch_limits" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required environment variables");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log(`[backfill-v3] Starting parallel processing: ${concurrency} x ${batchSize} = ${concurrency * batchSize} properties per cycle`);

    // Run multiple batches in parallel
    const batchPromises = Array.from({ length: concurrency }, async (_, i) => {
      try {
        const { data, error } = await supabase.rpc('backfill_property_aggregates_batch', {
          p_batch_size: batchSize
        });
        
        if (error) {
          console.error(`[backfill-v3] Batch ${i + 1} error:`, error.message);
          return { processed: 0, updated: 0, remaining: 0, error: error.message };
        }
        
        return data?.[0] || { processed: 0, updated: 0, remaining: 0 };
      } catch (err) {
        console.error(`[backfill-v3] Batch ${i + 1} exception:`, err);
        return { processed: 0, updated: 0, remaining: 0, error: String(err) };
      }
    });

    const results = await Promise.all(batchPromises);
    
    // Aggregate results
    const totalProcessed = results.reduce((sum, r) => sum + (r.processed || 0), 0);
    const totalUpdated = results.reduce((sum, r) => sum + (r.updated || 0), 0);
    const remaining = results[results.length - 1]?.remaining ?? 0;
    const errors = results.filter(r => r.error).length;

    console.log(`[backfill-v3] ========================================`);
    console.log(`[backfill-v3] Parallel batch complete:`);
    console.log(`[backfill-v3]   Processed: ${totalProcessed}`);
    console.log(`[backfill-v3]   Updated: ${totalUpdated}`);
    console.log(`[backfill-v3]   Remaining: ${remaining}`);
    console.log(`[backfill-v3]   Errors: ${errors}/${concurrency}`);
    console.log(`[backfill-v3] ========================================`);

    // Auto-resume if there are more to process
    const hasMore = remaining > 0 && totalProcessed > 0;
    
    const autoResuming = autoResume && hasMore && maxCycles > 1;
    if (autoResuming) {
      console.log(`[backfill-v3] Auto-resuming, ${remaining} remaining...`);
      
      const continueTask = async () => {
        try {
          const response = await fetch(`${SUPABASE_URL}/functions/v1/backfill-property-aggregates`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
              batchSize,
              concurrency,
              autoResume: true,
              maxCycles: maxCycles - 1,
            }),
          });
          await response.body?.cancel();
          if (!response.ok) throw new Error(`Continuation rejected: ${response.status}`);
        } catch (err) {
          console.error('[backfill-v3] Auto-resume failed:', err);
        }
      };
      
      const runtime = (globalThis as any).EdgeRuntime;
      if (typeof runtime !== 'undefined' && runtime.waitUntil) {
        runtime.waitUntil(continueTask());
      } else {
        await continueTask();
      }
    }

    const progress = {
      current: totalProcessed,
      remaining: remaining,
      percentage: remaining > 0 
        ? Math.round((totalProcessed / (totalProcessed + remaining)) * 100)
        : 100
    };

    return new Response(
      JSON.stringify({
        success: true,
        processed: totalProcessed,
        updated: totalUpdated,
        remaining: remaining,
        progress,
        autoResuming,
        version: 'v3-parallel'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error 
      ? error.message 
      : typeof error === 'object' && error !== null
        ? JSON.stringify(error)
        : String(error);
    console.error("[backfill-v3] Fatal error:", errorMessage);
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
