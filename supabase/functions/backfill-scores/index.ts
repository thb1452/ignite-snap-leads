 /**
  * BACKFILL SCORES - Process properties missing snap_score
  * 
  * Fetches properties with NULL snap_score and runs them through
  * the generate-insights function in batches.
  * Auto-continues until all are processed.
  */
 import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
 
 const VERSION = "v1.0";
 const BATCH_SIZE = 200;
 
 const corsHeaders = {
   'Access-Control-Allow-Origin': '*',
   'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
 };
 
 serve(async (req) => {
   console.log(`[backfill-scores ${VERSION}] Request received`);
 
   if (req.method === 'OPTIONS') {
     return new Response(null, { headers: corsHeaders });
   }
 
   const startTime = Date.now();
   
   try {
     const { autoResume = true, batchSize = BATCH_SIZE } = await req.json().catch(() => ({}));
 
     const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
     const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 
     if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
       throw new Error("Missing required environment variables");
     }
 
     const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
 
     // Count remaining
     const { count: remaining } = await supabase
       .from("properties")
       .select("id", { count: "exact", head: true })
       .is("snap_score", null);
 
     console.log(`[backfill-scores ${VERSION}] Properties with NULL snap_score: ${remaining}`);
 
     if (!remaining || remaining === 0) {
       return new Response(
         JSON.stringify({
           success: true,
           processed: 0,
           remaining: 0,
           message: "All properties have scores!",
           _version: VERSION
         }),
         { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }
 
     // Fetch batch of property IDs with NULL snap_score
     const { data: properties, error: fetchError } = await supabase
       .from("properties")
       .select("id")
       .is("snap_score", null)
       .limit(batchSize);
 
     if (fetchError) {
       console.error(`[backfill-scores ${VERSION}] Fetch error:`, fetchError);
       throw fetchError;
     }
 
     if (!properties || properties.length === 0) {
       return new Response(
         JSON.stringify({
           success: true,
           processed: 0,
           remaining: 0,
           message: "No properties to process",
           _version: VERSION
         }),
         { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }
 
     const propertyIds = properties.map(p => p.id);
     console.log(`[backfill-scores ${VERSION}] Processing batch of ${propertyIds.length} properties`);
 
     // Call generate-insights to process these properties
     const insightResponse = await fetch(`${SUPABASE_URL}/functions/v1/generate-insights`, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
       },
       body: JSON.stringify({ propertyIds }),
     });
 
     let processed = 0;
     if (insightResponse.ok) {
       const result = await insightResponse.json();
       processed = result.processed || 0;
       console.log(`[backfill-scores ${VERSION}] generate-insights processed: ${processed}`);
     } else {
       const errorText = await insightResponse.text();
       console.error(`[backfill-scores ${VERSION}] generate-insights failed: ${errorText}`);
     }
 
     const elapsed = Date.now() - startTime;
     const newRemaining = (remaining || 0) - processed;
     const hasMore = newRemaining > 0;
 
     // Auto-continue if more remain
     if (hasMore && autoResume) {
       const continueTask = async () => {
         await new Promise(resolve => setTimeout(resolve, 500));
         
         try {
           await fetch(`${SUPABASE_URL}/functions/v1/backfill-scores`, {
             method: 'POST',
             headers: {
               'Content-Type': 'application/json',
               'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
             },
             body: JSON.stringify({ autoResume, batchSize }),
           });
           console.log(`[backfill-scores ${VERSION}] Triggered next batch`);
         } catch (err) {
           console.error(`[backfill-scores ${VERSION}] Failed to trigger next batch:`, err);
         }
       };
 
       if (typeof (globalThis as any).EdgeRuntime !== 'undefined') {
         (globalThis as any).EdgeRuntime.waitUntil(continueTask());
       } else {
         continueTask().catch(console.error);
       }
       
       console.log(`[backfill-scores ${VERSION}] Auto-continuation scheduled`);
     }
 
     return new Response(
       JSON.stringify({
         success: true,
         processed,
         remaining: newRemaining,
         elapsed_ms: elapsed,
         has_more: hasMore,
         auto_continuing: hasMore && autoResume,
         _version: VERSION
       }),
       { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
     );
 
   } catch (error) {
     console.error(`[backfill-scores ${VERSION}] Fatal error:`, error);
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