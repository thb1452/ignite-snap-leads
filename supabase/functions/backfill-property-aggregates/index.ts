/**
 * Backfill Property Aggregates (v2 - SQL Native)
 *
 * Uses a high-performance SQL function to recalculate violation aggregates.
 * ~100x faster than the previous individual-update approach.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface BackfillRequest {
  batchSize?: number;  // Default: 100 (reduced further for reliability)
  autoResume?: boolean; // Auto-continue until all processed
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      batchSize = 100,  // Reduced further for reliability with statement timeout
      autoResume = true,
    }: BackfillRequest = await req.json().catch(() => ({}));

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required environment variables");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log(`[backfill-v2] Starting SQL-native backfill with batch size ${batchSize}...`);

    // Call the SQL function for high-performance batch processing
    const { data, error } = await supabase.rpc('backfill_property_aggregates_batch', {
      p_batch_size: batchSize
    });

    if (error) {
      console.error("[backfill-v2] SQL function error:", error);
      throw error;
    }

    const result = data?.[0] || { processed: 0, updated: 0, remaining: 0 };
    
    console.log(`[backfill-v2] ========================================`);
    console.log(`[backfill-v2] Batch complete (SQL-native):`);
    console.log(`[backfill-v2]   Processed: ${result.processed}`);
    console.log(`[backfill-v2]   Updated: ${result.updated}`);
    console.log(`[backfill-v2]   Remaining: ${result.remaining}`);
    console.log(`[backfill-v2] ========================================`);

    // Auto-resume if there are more to process
    const hasMore = result.remaining > 0 && result.processed > 0;
    
    if (autoResume && hasMore) {
      console.log(`[backfill-v2] Auto-resuming, ${result.remaining} remaining...`);
      
      const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
      
      const continueTask = async () => {
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/backfill-property-aggregates`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              batchSize,
              autoResume: true,
            }),
          });
        } catch (err) {
          console.error('[backfill-v2] Auto-resume failed:', err);
        }
      };
      
      // Use EdgeRuntime.waitUntil for reliable background continuation
      const runtime = (globalThis as any).EdgeRuntime;
      if (typeof runtime !== 'undefined' && runtime.waitUntil) {
        runtime.waitUntil(continueTask());
      } else {
        continueTask();
      }
    }

    const progress = {
      current: result.processed,
      remaining: result.remaining,
      percentage: result.remaining > 0 
        ? Math.round(((result.processed) / (result.processed + result.remaining)) * 100)
        : 100
    };

    return new Response(
      JSON.stringify({
        success: true,
        processed: result.processed,
        updated: result.updated,
        remaining: result.remaining,
        progress,
        autoResuming: autoResume && hasMore,
        version: 'v2-sql-native'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error 
      ? error.message 
      : typeof error === 'object' && error !== null
        ? JSON.stringify(error)
        : String(error);
    console.error("[backfill-v2] Fatal error:", errorMessage);
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
