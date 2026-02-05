 /**
  * BACKFILL INSIGHTS v2.0 - SQL-Native High-Performance Processor
  * 
  * Uses native SQL function backfill_insights_batch() for 100x faster processing
  * Processes 5000 properties per call directly in Postgres
  * Auto-continues until all NULLs are processed
  */
 import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
 
 const VERSION = "v2.0";
 const BATCH_SIZE = 5000;
 
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
     const { autoResume = true, batchSize = BATCH_SIZE, mode = 'null' } = await req.json().catch(() => ({}));
 
     const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
     const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 
     if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
       throw new Error("Missing required environment variables");
     }
 
     const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
 
     let processed = 0;
     let remaining = 0;
 
     // Use the appropriate SQL function based on mode
     if (mode === 'outdated') {
       // Refresh outdated investor-language insights
       const { data, error } = await supabase.rpc('refresh_outdated_insights_batch', {
         batch_size: batchSize
       });
       
       if (error) {
         console.error(`[backfill-insights ${VERSION}] RPC error:`, error);
         throw error;
       }
       
       if (data && data.length > 0) {
         processed = data[0].processed || 0;
         remaining = data[0].remaining || 0;
       }
       
       console.log(`[backfill-insights ${VERSION}] Outdated refresh: ${processed} processed, ${remaining} remaining`);
     } else {
       // Backfill NULL insights
       const { data, error } = await supabase.rpc('backfill_insights_batch', {
         batch_size: batchSize
       });
       
       if (error) {
         console.error(`[backfill-insights ${VERSION}] RPC error:`, error);
         throw error;
       }
       
       if (data && data.length > 0) {
         processed = data[0].processed || 0;
         remaining = data[0].remaining || 0;
       }
       
       console.log(`[backfill-insights ${VERSION}] NULL backfill: ${processed} processed, ${remaining} remaining`);
     }
 
     const elapsed = Date.now() - startTime;
     const hasMore = remaining > 0;
 
     // Auto-continue if more remain
     if (hasMore && autoResume) {
       const continueTask = async () => {
         await new Promise(resolve => setTimeout(resolve, 500)); // Brief pause
         
         try {
           await fetch(`${SUPABASE_URL}/functions/v1/backfill-insights`, {
             method: 'POST',
             headers: {
               'Content-Type': 'application/json',
               'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
             },
             body: JSON.stringify({ autoResume, batchSize, mode }),
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
         processed,
         remaining,
         elapsed_ms: elapsed,
         has_more: hasMore,
         auto_continuing: hasMore && autoResume,
         mode,
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