/**
 * Refresh Outdated Insights - Server-side batch processing for properties with investor language
 * 
 * Targets ONLY properties with outdated investor-focused language and regenerates
 * their insights using the new compliance/enforcement-focused prompts.
 * 
 * v2.1: Requires admin auth or internal service-role secret for security.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const VERSION = "v2.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 200; // Increased from 50
const CONCURRENT_CHUNKS = 4; // Process 4 chunks of 50 in parallel

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
  'perfect for', 'excellent', 'strong potential',
  // Owner speculation
  'neglect', 'owner disregard', 'owner neglect'
];

serve(async (req) => {
  console.log(`[refresh-outdated ${VERSION}] Request received`);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required environment variables");
    }

    // Authenticate: allow service-role self-invocations OR admin users
    const authHeader = req.headers.get('authorization') ?? '';
    const internalSecret = req.headers.get('x-internal-secret');
    const isInternalCall = internalSecret === SUPABASE_SERVICE_ROLE_KEY;

    if (!isInternalCall) {
      if (!authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
      }
      const token = authHeader.replace('Bearer ', '');
      const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? SUPABASE_SERVICE_ROLE_KEY, {
        global: { headers: { Authorization: authHeader } }
      });
      const { data: authData, error: authErr } = await anonClient.auth.getUser(token);
      if (authErr || !authData?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
      }
      // Require admin role
      const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: roleData } = await adminClient.from('user_roles').select('role').eq('user_id', authData.user.id).eq('role', 'admin').maybeSingle();
      if (!roleData) {
        return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: corsHeaders });
      }
    }

    const { offset = 0, dryRun = false, autoResume = true } = await req.json().catch(() => ({}));

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Build the OR condition for outdated terms
    const orConditions = OUTDATED_TERMS.map(term => `snap_insight.ilike.%${term}%`).join(',');

    // Get total count of outdated properties
    const { count: totalCount } = await supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .not("snap_insight", "is", null)
      .or(orConditions);

    console.log(`[refresh-outdated ${VERSION}] Starting at offset ${offset}, total outdated: ${totalCount}`);

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
          complete: true,
          _version: VERSION
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const propertyIds = properties.map(p => p.id);
    const scores = properties.map(p => p.snap_score ?? 0);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const maxScore = scores.length > 0 ? Math.max(...scores) : 0;
    console.log(`[refresh-outdated ${VERSION}] Processing ${propertyIds.length} properties (offset ${offset})`);
    console.log(`[refresh-outdated ${VERSION}] Priority batch: max_score=${maxScore}, avg_score=${avgScore}`);

    // Split into chunks and process in parallel
    let totalProcessed = 0;
    let totalAiGenerated = 0;
    let totalRuleBased = 0;

    if (!dryRun) {
      const chunkSize = Math.ceil(propertyIds.length / CONCURRENT_CHUNKS);
      const chunks: string[][] = [];
      
      for (let i = 0; i < propertyIds.length; i += chunkSize) {
        chunks.push(propertyIds.slice(i, i + chunkSize));
      }

      console.log(`[refresh-outdated ${VERSION}] Processing ${chunks.length} chunks in parallel`);

      // Process chunks in parallel
      const results = await Promise.allSettled(
        chunks.map(async (chunk, idx) => {
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
              console.log(`[refresh-outdated ${VERSION}] Chunk ${idx + 1} complete: ${result.processed || 0} processed`);
              return {
                processed: result.processed || 0,
                ai_generated: result.breakdown?.ai_generated || 0,
                rule_based: result.breakdown?.rule_based || 0,
              };
            } else {
              const errorText = await response.text();
              console.error(`[refresh-outdated ${VERSION}] Chunk ${idx + 1} failed: ${errorText}`);
              return { processed: 0, ai_generated: 0, rule_based: 0 };
            }
          } catch (err) {
            console.error(`[refresh-outdated ${VERSION}] Chunk ${idx + 1} error:`, err);
            return { processed: 0, ai_generated: 0, rule_based: 0 };
          }
        })
      );

      // Aggregate results
      for (const result of results) {
        if (result.status === 'fulfilled') {
          totalProcessed += result.value.processed;
          totalAiGenerated += result.value.ai_generated;
          totalRuleBased += result.value.rule_based;
        }
      }
    }

    const elapsed = Date.now() - startTime;
    const nextOffset = offset + BATCH_SIZE;
    const isComplete = nextOffset >= (totalCount || 0);
    const progress = Math.round((nextOffset / (totalCount || 1)) * 100);

    console.log(`[refresh-outdated ${VERSION}] Batch complete: ${totalProcessed} processed in ${elapsed}ms`);
    console.log(`[refresh-outdated ${VERSION}] Progress: ${progress}% (${nextOffset}/${totalCount})`);

    // Auto-continue if enabled and not complete
    if (!isComplete && !dryRun && autoResume) {
      // Use EdgeRuntime.waitUntil for reliable background continuation
      const continueTask = async () => {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Brief pause
        
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/refresh-outdated-insights`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'x-internal-secret': SUPABASE_SERVICE_ROLE_KEY,
            },
            body: JSON.stringify({ offset: nextOffset, autoResume }),
          });
          console.log(`[refresh-outdated ${VERSION}] Triggered next batch at offset ${nextOffset}`);
        } catch (err) {
          console.error(`[refresh-outdated ${VERSION}] Failed to trigger next batch:`, err);
        }
      };

      // Use waitUntil if available, otherwise fire-and-forget
      if (typeof (globalThis as any).EdgeRuntime !== 'undefined') {
        (globalThis as any).EdgeRuntime.waitUntil(continueTask());
      } else {
        continueTask().catch(console.error);
      }
      
      console.log(`[refresh-outdated ${VERSION}] Auto-continuation scheduled`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: totalProcessed,
        ai_generated: totalAiGenerated,
        rule_based: totalRuleBased,
        elapsed_ms: elapsed,
        progress: {
          current: Math.min(nextOffset, totalCount || 0),
          total: totalCount,
          percentage: Math.min(100, progress),
          complete: isComplete
        },
        next_offset: isComplete ? null : nextOffset,
        auto_continuing: !isComplete && !dryRun && autoResume,
        _version: VERSION
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`[refresh-outdated ${VERSION}] Fatal error:`, error);
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
