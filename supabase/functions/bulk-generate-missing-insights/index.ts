/**
 * Bulk Generate Missing Insights - Fast server-side batch processing
 * 
 * ONLY processes properties that are MISSING insights (snap_insight IS NULL).
 * Uses parallel processing for speed. Self-continues until complete.
 * Requires admin authentication or internal service-role secret.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Process 50 properties per batch — split into 5 parallel chunks of 10
const BATCH_SIZE = 50;
const CHUNK_SIZE = 10; // Each generate-insights call handles 10 properties

serve(async (req) => {
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
        console.error('[bulk-missing] No Bearer token provided');
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const token = authHeader.replace('Bearer ', '');
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? SUPABASE_SERVICE_ROLE_KEY;
      const anonClient = createClient(SUPABASE_URL, anonKey, {
        global: { headers: { Authorization: authHeader } }
      });
      // Use getClaims for signing-keys compatibility
      const { data: claimsData, error: claimsErr } = await anonClient.auth.getClaims(token);
      if (claimsErr || !claimsData?.claims?.sub) {
        console.error('[bulk-missing] getClaims failed:', claimsErr?.message ?? 'no claims');
        // Fallback to getUser if getClaims not available
        const { data: authData, error: authErr } = await anonClient.auth.getUser(token);
        if (authErr || !authData?.user) {
          console.error('[bulk-missing] getUser also failed:', authErr?.message);
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        // Check admin role
        const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const { data: roleData } = await adminClient.from('user_roles').select('role').eq('user_id', authData.user.id).eq('role', 'admin').maybeSingle();
        if (!roleData) {
          return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        console.log(`[bulk-missing] Admin verified via getUser: ${authData.user.id}`);
      } else {
        const userId = claimsData.claims.sub as string;
        // Check admin role
        const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const { data: roleData } = await adminClient.from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin').maybeSingle();
        if (!roleData) {
          return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        console.log(`[bulk-missing] Admin verified via getClaims: ${userId}`);
      }
    }

    const { offset = 0, dryRun = false, autoResume = true, forceRefresh = false, minScore = 0, sinceDays = 0, enforcementType = '' } = await req.json().catch(() => ({}));

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Build query — forceRefresh overwrites existing insights for score >= minScore
    let countQuery = supabase.from("properties").select("id", { count: "exact", head: true });
    let fetchQuery = supabase.from("properties").select("id, snap_score");

    // Filter by enforcement_type if specified (e.g., 'water_shutoff')
    if (enforcementType) {
      countQuery = countQuery.eq("enforcement_type", enforcementType);
      fetchQuery = fetchQuery.eq("enforcement_type", enforcementType);
      console.log(`[bulk-missing] ENFORCEMENT TYPE filter: ${enforcementType}`);
    }

    if (sinceDays > 0) {
      // Target only recent properties created within the last N days, score >= 50 for AI
      const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
      countQuery = countQuery.gte("created_at", since).gte("snap_score", minScore > 0 ? minScore : 50);
      fetchQuery = fetchQuery.gte("created_at", since).gte("snap_score", minScore > 0 ? minScore : 50);
      console.log(`[bulk-missing] RECENT mode: last ${sinceDays} days, score >= ${minScore > 0 ? minScore : 50}`);
    } else if (forceRefresh) {
      // Re-generate insights for ALL matching properties (even if already set)
      if (minScore > 0) {
        countQuery = countQuery.gte("snap_score", minScore);
        fetchQuery = fetchQuery.gte("snap_score", minScore);
      }
      // When minScore=0 and forceRefresh=true, NO filter = process ALL properties
      console.log(`[bulk-missing] FORCE REFRESH mode: ${minScore > 0 ? `score >= ${minScore}` : 'ALL PROPERTIES'}${enforcementType ? ` enforcement_type=${enforcementType}` : ''}`);
    } else if (!enforcementType) {
      // Default: only properties missing insights
      countQuery = countQuery.is("snap_insight", null);
      fetchQuery = fetchQuery.is("snap_insight", null);
    }

    const { count: totalMissing } = await countQuery;

    console.log(`[bulk-missing] Starting at offset ${offset}, total to process: ${totalMissing}`);

    // Fetch batch — high snap_score first
    const { data: properties, error: fetchError } = await fetchQuery
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

    // Process the batch in parallel chunks of CHUNK_SIZE
    let totalProcessed = 0;
    let totalAI = 0;
    let totalRuleBased = 0;

    if (!dryRun) {
      // Split into chunks and process in parallel
      const chunks: string[][] = [];
      for (let i = 0; i < propertyIds.length; i += CHUNK_SIZE) {
        chunks.push(propertyIds.slice(i, i + CHUNK_SIZE));
      }
      
      console.log(`[bulk-missing] Sending ${chunks.length} parallel chunks of up to ${CHUNK_SIZE}`);
      
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
              console.log(`[bulk-missing] Chunk ${idx + 1}/${chunks.length}: ${result.processed || 0} processed`);
              return result;
            } else {
              const errText = await response.text().catch(() => 'no body');
              console.error(`[bulk-missing] Chunk ${idx + 1} failed (${response.status}): ${errText}`);
              return null;
            }
          } catch (err) {
            console.error(`[bulk-missing] Chunk ${idx + 1} error:`, err);
            return null;
          }
        })
      );
      
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          totalProcessed += r.value.processed || 0;
          totalAI += r.value.breakdown?.ai_generated || 0;
          totalRuleBased += r.value.breakdown?.rule_based || 0;
        }
      }
      console.log(`[bulk-missing] All chunks done: ${totalProcessed} processed (${totalAI} AI, ${totalRuleBased} rule-based)`);
    }

    const elapsed = Date.now() - startTime;
    const nextOffset = offset + BATCH_SIZE;
    const isComplete = nextOffset >= (totalMissing || 0);
    const progress = Math.round((nextOffset / (totalMissing || 1)) * 100);

    console.log(`[bulk-missing] Batch complete: ${totalProcessed} processed in ${elapsed}ms`);
    console.log(`[bulk-missing] Progress: ${Math.min(100, progress)}% (${Math.min(nextOffset, totalMissing || 0)}/${totalMissing})`);

    // Auto-continue if enabled and not complete - use waitUntil for reliability
    // When current tier is complete AND cascadeDown is true, drop to next score tier
    // cascadeDown is always true by default — cascade through score tiers
    
    const selfUrl = `${SUPABASE_URL}/functions/v1/bulk-generate-missing-insights`;
    
    const scheduleNext = (payload: Record<string, unknown>) => {
      const triggerNext = async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        try {
          const res = await fetch(selfUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'x-internal-secret': SUPABASE_SERVICE_ROLE_KEY,
            },
            body: JSON.stringify(payload),
          });
          console.log(`[bulk-missing] Next batch triggered, status: ${res.status}`);
        } catch (err) {
          console.error('[bulk-missing] Failed to trigger next batch:', err);
        }
      };
      // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(triggerNext());
      } else {
        triggerNext().catch(console.error);
      }
    };

    if (!isComplete && !dryRun && autoResume) {
      scheduleNext({ offset: nextOffset, autoResume, forceRefresh, minScore, sinceDays, enforcementType });
      console.log(`[bulk-missing] Scheduled next batch at offset ${nextOffset}`);
    } else if (isComplete && !dryRun && autoResume && forceRefresh && minScore > 0) {
      // Cascade down to the next score tier
      const SCORE_TIERS = [50, 30, 10, 0];
      const currentTierIndex = SCORE_TIERS.indexOf(minScore);
      const nextTier = currentTierIndex >= 0 && currentTierIndex < SCORE_TIERS.length - 1
        ? SCORE_TIERS[currentTierIndex + 1]
        : null;
      
      if (nextTier !== null) {
        console.log(`[bulk-missing] ✅ Tier score>=${minScore} COMPLETE! Cascading down to score>=${nextTier}`);
        scheduleNext({ offset: 0, autoResume, forceRefresh, minScore: nextTier, sinceDays, enforcementType });
      } else {
        console.log(`[bulk-missing] 🎉 ALL TIERS COMPLETE! Every property has been processed.`);
      }
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
