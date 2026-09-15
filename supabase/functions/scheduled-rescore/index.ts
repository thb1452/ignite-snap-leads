import { insightOperatorDenial } from "../_shared/insightOperatorAuth.ts";
/**
 * Scheduled Rescore - Lightweight weekly score refresh
 * 
 * Targets properties with open violations where duration-based scoring drifts over time.
 * Calls generate-insights in batches to recalculate scores with current dates.
 * Uses self-invocation pattern for reliable background processing.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const BATCH_SIZE = 100;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const denial = await insightOperatorDenial(req, corsHeaders);
  if (denial) return denial;

  const startTime = Date.now();

  try {
    const { offset = 0 } = await req.json().catch(() => ({}));

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required environment variables");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Only rescore properties with open violations (where duration drift matters)
    const { count: totalCount } = await supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .gt("open_violations", 0);

    console.log(`[scheduled-rescore] Open-violation properties: ${totalCount}, offset: ${offset}`);

    const { data: properties, error: fetchError } = await supabase
      .from("properties")
      .select("id")
      .gt("open_violations", 0)
      .order("id")
      .range(offset, offset + BATCH_SIZE - 1);

    if (fetchError) throw fetchError;

    if (!properties || properties.length === 0) {
      console.log(`[scheduled-rescore] Complete! Processed ${offset} properties.`);
      return new Response(
        JSON.stringify({ success: true, complete: true, processed: offset, total: totalCount }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const propertyIds = properties.map(p => p.id);
    console.log(`[scheduled-rescore] Rescoring batch of ${propertyIds.length} (${offset + 1}–${offset + propertyIds.length})`);

    // Call generate-insights to recalculate scores with current dates
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/generate-insights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ propertyIds }),
      });

      if (!resp.ok) {
        await resp.body?.cancel();
        return new Response(JSON.stringify({ success: false, error: resp.status === 503 ? 'insights_held' : 'insights_outcome_unconfirmed', auto_continuing: false, offset }), {
          status: resp.status === 503 ? 503 : 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
        const result = await resp.json();
        if (!result || result.success === false || Object.hasOwn(result, 'error') || !Number.isInteger(result.processed) || result.processed !== propertyIds.length) {
          return new Response(JSON.stringify({ success: false, error: 'insights_outcome_unconfirmed', auto_continuing: false, offset }), {
            status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        console.log(`[scheduled-rescore] Batch done: ${result.processed} rescored`);
      }
    } catch (err) {
      console.error(`[scheduled-rescore] Insight call failed:`, err);
      return new Response(JSON.stringify({ success: false, error: 'insights_outcome_unconfirmed', auto_continuing: false, offset }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const nextOffset = offset + BATCH_SIZE;
    const isComplete = nextOffset >= (totalCount || 0);

    // Self-invoke for next batch
    if (!isComplete) {
      const selfUrl = `${SUPABASE_URL}/functions/v1/scheduled-rescore`;
      EdgeRuntime.waitUntil(
        fetch(selfUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': SUPABASE_SERVICE_ROLE_KEY,
          },
          body: JSON.stringify({ offset: nextOffset }),
        }).catch(err => console.error('[scheduled-rescore] Self-invoke failed:', err))
      );
      console.log(`[scheduled-rescore] Triggered next batch at offset ${nextOffset}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        complete: isComplete,
        processed: offset + propertyIds.length,
        total: totalCount,
        elapsed_ms: Date.now() - startTime,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("[scheduled-rescore] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
