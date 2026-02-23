/**
 * Bulk Rescore - Admin-only batch processing for ALL properties.
 * Requires admin JWT or x-internal-secret for self-invocation.
 * 
 * v4: Supports full rescore of ALL properties (mode=all) or only unscored (mode=unscored).
 * Tracks progress via offset-based pagination.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
};

const BATCH_SIZE = 500;
const CHUNK_SIZE = 50;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // SECURITY: Require internal secret or admin JWT
  const internalSecret = req.headers.get("x-internal-secret");
  if (!internalSecret || internalSecret !== SUPABASE_SERVICE_ROLE_KEY) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const authClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roleData } = await adminClient.from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  const startTime = Date.now();
  
  try {
    const { dryRun = false, mode = 'all', offset = 0 } = await req.json().catch(() => ({}));

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Count total
    const { count: totalCount } = await supabase
      .from("properties")
      .select("id", { count: "exact", head: true });

    console.log(`[bulk-rescore v4] Mode: ${mode} | Offset: ${offset} | Total: ${totalCount}`);

    // Fetch batch of properties by offset (deterministic order)
    const { data: properties, error: fetchError } = await supabase
      .from("properties")
      .select("id")
      .order("id")
      .range(offset, offset + BATCH_SIZE - 1);

    if (fetchError) throw fetchError;

    if (!properties || properties.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "All properties processed!", processed: 0, total: totalCount, complete: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let totalProcessed = 0;
    let totalAI = 0;
    let totalRule = 0;

    if (!dryRun) {
      const allIds = properties.map(p => p.id);
      const chunks: string[][] = [];
      for (let i = 0; i < allIds.length; i += CHUNK_SIZE) {
        chunks.push(allIds.slice(i, i + CHUNK_SIZE));
      }

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
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
            totalProcessed += result.processed || 0;
            totalAI += result.breakdown?.ai_generated || 0;
            totalRule += result.breakdown?.rule_based || 0;
          } else {
            const errText = await response.text();
            console.error(`[bulk-rescore v3] Chunk ${i + 1} failed: ${errText}`);
          }
        } catch (err) {
          console.error(`[bulk-rescore v3] Chunk ${i + 1} error:`, err);
        }
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
    }

    const elapsed = Date.now() - startTime;
    const nextOffset = offset + properties.length;
    const isComplete = nextOffset >= (totalCount || 0);
    const progress = Math.round((nextOffset / (totalCount || 1)) * 100);

    console.log(`[bulk-rescore v4] Batch: ${totalProcessed} processed (${totalAI} AI, ${totalRule} rule) in ${elapsed}ms | ${progress}% done (offset ${nextOffset}/${totalCount})`);

    // Auto-continue if more remain
    if (!isComplete && !dryRun) {
      const triggerNext = async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
        try {
          const res = await fetch(`${SUPABASE_URL}/functions/v1/bulk-rescore`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-internal-secret': SUPABASE_SERVICE_ROLE_KEY,
            },
            body: JSON.stringify({ mode, offset: nextOffset }),
          });
          console.log(`[bulk-rescore v4] Next batch triggered (offset ${nextOffset}), status: ${res.status}`);
        } catch (err) {
          console.error('[bulk-rescore v4] Failed to trigger next batch:', err);
        }
      };

      // @ts-ignore
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(triggerNext());
      } else {
        triggerNext().catch(console.error);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: totalProcessed,
        ai_generated: totalAI,
        rule_based: totalRule,
        elapsed_ms: elapsed,
        progress: { scored: nextOffset, total: totalCount, remaining: (totalCount || 0) - nextOffset, percentage: Math.min(100, progress), complete: isComplete },
        auto_continuing: !isComplete && !dryRun
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("[bulk-rescore v4] Fatal error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
