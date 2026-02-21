/**
 * Bulk Rescore - Admin-only batch processing for all properties.
 * Requires admin JWT or x-internal-secret for self-invocation.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
};

const BATCH_SIZE = 50;

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
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roleData } = await adminClient.from("user_roles").select("role").eq("user_id", claimsData.claims.sub).eq("role", "admin").maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  const startTime = Date.now();
  
  try {
    const { offset = 0, dryRun = false } = await req.json().catch(() => ({}));

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { count: totalCount } = await supabase
      .from("properties")
      .select("id", { count: "exact", head: true });

    console.log(`[bulk-rescore] Starting at offset ${offset}, total properties: ${totalCount}`);

    const { data: properties, error: fetchError } = await supabase
      .from("properties")
      .select("id")
      .order("id")
      .range(offset, offset + BATCH_SIZE - 1);

    if (fetchError) throw fetchError;

    if (!properties || properties.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "All properties processed!", processed: offset, total: totalCount, complete: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const propertyIds = properties.map(p => p.id);

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
        } else {
          console.error(`[bulk-rescore] generate-insights failed: ${await insightResponse.text()}`);
        }
      } catch (insightError) {
        console.error(`[bulk-rescore] Error calling generate-insights:`, insightError);
      }
    }

    const elapsed = Date.now() - startTime;
    const nextOffset = offset + BATCH_SIZE;
    const isComplete = nextOffset >= (totalCount || 0);
    const progress = Math.round((nextOffset / (totalCount || 1)) * 100);

    if (!isComplete && !dryRun) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      fetch(`${SUPABASE_URL}/functions/v1/bulk-rescore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': SUPABASE_SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({ offset: nextOffset }),
      }).catch(err => console.error('[bulk-rescore] Failed to trigger next batch:', err));
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: insightResult.processed,
        ai_generated: insightResult.ai_generated,
        rule_based: insightResult.rule_based,
        elapsed_ms: elapsed,
        progress: { current: nextOffset, total: totalCount, percentage: Math.min(100, progress), complete: isComplete },
        next_offset: isComplete ? null : nextOffset,
        auto_continuing: !isComplete && !dryRun
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("[bulk-rescore] Fatal error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
