import { insightOperatorDenial } from "../_shared/insightOperatorAuth.ts";
/**
 * BACKFILL SCORES v1.2 - Process properties missing snap_score
 * Admin-only function with x-internal-secret support for self-invocation.
 * Scheduler calls must carry the actual configured private internal credential.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const VERSION = "v1.2";
const BATCH_SIZE = 50;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
};

serve(async (req) => {
  console.log(`[backfill-scores ${VERSION}] Request received`);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const denial = await insightOperatorDenial(req, corsHeaders);
  if (denial) return denial;

  const startTime = Date.now();
  
  try {
    const { autoResume = true, batchSize = BATCH_SIZE } = await req.json().catch(() => ({}));

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { count: remaining } = await supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .is("snap_score", null);

    console.log(`[backfill-scores ${VERSION}] Properties with NULL snap_score: ${remaining}`);

    if (!remaining || remaining === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, remaining: 0, message: "All properties have scores!", _version: VERSION }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: properties, error: fetchError } = await supabase
      .from("properties")
      .select("id")
      .is("snap_score", null)
      .limit(batchSize);

    if (fetchError) throw fetchError;

    if (!properties || properties.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, remaining: 0, message: "No properties to process", _version: VERSION }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const propertyIds = properties.map(p => p.id);
    console.log(`[backfill-scores ${VERSION}] Processing batch of ${propertyIds.length} properties`);

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
      if (!result || result.success === false || Object.hasOwn(result, 'error') || !Number.isInteger(result.processed) || result.processed !== propertyIds.length) {
        return new Response(JSON.stringify({ success: false, error: 'insights_outcome_unconfirmed', auto_continuing: false, _version: VERSION }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      processed = result.processed;
    } else {
      await insightResponse.body?.cancel();
      return new Response(JSON.stringify({ success: false, error: insightResponse.status === 503 ? 'insights_held' : 'insights_outcome_unconfirmed', auto_continuing: false, _version: VERSION }), {
        status: insightResponse.status === 503 ? 503 : 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const elapsed = Date.now() - startTime;
    const newRemaining = (remaining || 0) - processed;
    const hasMore = newRemaining > 0;

    // Self-invoke for next batch — fire-and-forget with retry
    if (hasMore && autoResume) {
      const triggerNext = async () => {
        // Brief pause to avoid hammering
        await new Promise(resolve => setTimeout(resolve, 300));
        
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const resp = await fetch(`${SUPABASE_URL}/functions/v1/backfill-scores`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-internal-secret': SUPABASE_SERVICE_ROLE_KEY,
              },
              body: JSON.stringify({ autoResume, batchSize }),
            });
            if (resp.ok) {
              console.log(`[backfill-scores ${VERSION}] Next batch triggered (attempt ${attempt})`);
              // Consume the body to prevent resource leak
              await resp.text();
              return;
            }
            const body = await resp.text();
            console.error(`[backfill-scores ${VERSION}] Next batch trigger failed (attempt ${attempt}, status ${resp.status}): ${body}`);
          } catch (err) {
            console.error(`[backfill-scores ${VERSION}] Next batch trigger error (attempt ${attempt}):`, err);
          }
          // Exponential backoff
          if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          }
        }
        console.error(`[backfill-scores ${VERSION}] All 3 self-invocation attempts failed — watchdog cron will restart`);
      };

      if (typeof (globalThis as any).EdgeRuntime !== 'undefined') {
        (globalThis as any).EdgeRuntime.waitUntil(triggerNext());
      } else {
        triggerNext().catch(console.error);
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed, remaining: newRemaining, elapsed_ms: elapsed, has_more: hasMore, auto_continuing: hasMore && autoResume, _version: VERSION }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`[backfill-scores ${VERSION}] Fatal error:`, error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error), _version: VERSION }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
