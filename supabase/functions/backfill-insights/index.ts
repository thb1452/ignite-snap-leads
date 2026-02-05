 /**
  * BACKFILL INSIGHTS v1.0 - High-Volume Batch Processor
  * 
  * Processes properties with NULL snap_insight in batches of 10,000
  * Uses the partial index idx_properties_snap_insight_null for performance
  * 
  * NO statement timeouts - NO expensive count queries in hot path
  * Auto-continues until all NULLs are processed
  */
 import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
 
 const VERSION = "v1.0";
 const BATCH_SIZE = 10000; // Process 10k at a time
 const SUB_BATCH_SIZE = 100; // Process 100 at a time for generate-insights
 
 const corsHeaders = {
   'Access-Control-Allow-Origin': '*',
   'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
 };
 
 serve(async (req) => {
   console.log(`[backfill-insights ${VERSION}] Request received`);
 
   if (req.method === 'OPTIONS') {
     return new Response(null, { headers: corsHeaders });
   }
 
   const startTime = Date.now();
   
   try {
     const { dryRun = false, autoResume = true, limit } = await req.json().catch(() => ({}));
 
     const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
     const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 
     if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
       throw new Error("Missing required environment variables");
     }
 
     const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
 
     // Use limit if provided, otherwise use BATCH_SIZE
     const batchLimit = limit || BATCH_SIZE;
 
     // Fetch properties with NULL snap_insight (uses partial index)
     // NO COUNT QUERY - just fetch and process
     const { data: properties, error: fetchError } = await supabase
       .from("properties")
       .select("id")
       .is("snap_insight", null)
       .order("id")
       .limit(batchLimit);
 
     if (fetchError) {
       console.error(`[backfill-insights ${VERSION}] Fetch error:`, fetchError);
       throw fetchError;
     }
 
     if (!properties || properties.length === 0) {
       console.log(`[backfill-insights ${VERSION}] No more properties to process - COMPLETE!`);
       return new Response(
         JSON.stringify({
           success: true,
           message: "All insights backfilled - no NULL values remain!",
           processed: 0,
           complete: true,
           _version: VERSION
         }),
         { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }
 
     const propertyIds = properties.map(p => p.id);
     console.log(`[backfill-insights ${VERSION}] Processing ${propertyIds.length} properties`);
 
     let totalProcessed = 0;
     let totalErrors = 0;
 
     if (!dryRun) {
       // Process in sub-batches to avoid overwhelming generate-insights
       for (let i = 0; i < propertyIds.length; i += SUB_BATCH_SIZE) {
         const subBatch = propertyIds.slice(i, i + SUB_BATCH_SIZE);
         const batchNum = Math.floor(i / SUB_BATCH_SIZE) + 1;
         const totalBatches = Math.ceil(propertyIds.length / SUB_BATCH_SIZE);
         
         console.log(`[backfill-insights ${VERSION}] Sub-batch ${batchNum}/${totalBatches} (${subBatch.length} properties)`);
         
         try {
           const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-insights`, {
             method: 'POST',
             headers: {
               'Content-Type': 'application/json',
               'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
             },
             body: JSON.stringify({ propertyIds: subBatch }),
           });
           
           if (response.ok) {
             const result = await response.json();
             totalProcessed += result.processed || 0;
             totalErrors += result.errors || 0;
             console.log(`[backfill-insights ${VERSION}] Sub-batch ${batchNum} complete: ${result.processed || 0} processed`);
           } else {
             const errorText = await response.text();
             console.error(`[backfill-insights ${VERSION}] Sub-batch ${batchNum} failed:`, errorText);
             totalErrors += subBatch.length;
           }
         } catch (err) {
           console.error(`[backfill-insights ${VERSION}] Sub-batch ${batchNum} error:`, err);
           totalErrors += subBatch.length;
         }
       }
     } else {
       console.log(`[backfill-insights ${VERSION}] DRY RUN - would process ${propertyIds.length} properties`);
       totalProcessed = propertyIds.length;
     }
 
     const elapsed = Date.now() - startTime;
     const hasMore = properties.length === batchLimit;
 
     console.log(`[backfill-insights ${VERSION}] Batch complete: ${totalProcessed} processed, ${totalErrors} errors in ${elapsed}ms`);
 
     // Auto-continue if more remain
     if (hasMore && !dryRun && autoResume) {
       const continueTask = async () => {
         await new Promise(resolve => setTimeout(resolve, 2000)); // Brief pause between batches
         
         try {
           await fetch(`${SUPABASE_URL}/functions/v1/backfill-insights`, {
             method: 'POST',
             headers: {
               'Content-Type': 'application/json',
               'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
             },
             body: JSON.stringify({ autoResume, limit: batchLimit }),
           });
           console.log(`[backfill-insights ${VERSION}] Triggered next batch`);
         } catch (err) {
           console.error(`[backfill-insights ${VERSION}] Failed to trigger next batch:`, err);
         }
       };
 
       if (typeof (globalThis as any).EdgeRuntime !== 'undefined') {
         (globalThis as any).EdgeRuntime.waitUntil(continueTask());
       } else {
         continueTask().catch(console.error);
       }
       
       console.log(`[backfill-insights ${VERSION}] Auto-continuation scheduled`);
     }
 
     return new Response(
       JSON.stringify({
         success: true,
         processed: totalProcessed,
         errors: totalErrors,
         batch_size: propertyIds.length,
         elapsed_ms: elapsed,
         has_more: hasMore,
         auto_continuing: hasMore && !dryRun && autoResume,
         _version: VERSION
       }),
       { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
     );
 
   } catch (error) {
     console.error(`[backfill-insights ${VERSION}] Fatal error:`, error);
     return new Response(
       JSON.stringify({
         success: false,
         error: error instanceof Error ? error.message : String(error),
         _version: VERSION
       }),
       { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
     );
   }
 });