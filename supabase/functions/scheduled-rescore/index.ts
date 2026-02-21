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

  const startTime = Date.now();

  try {
    const { offset = 0 } = await req.json().catch(() => ({}));

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required environment variables");
    }

    // Auth: service role, internal self-invoke, pg_cron (via pg_net), or admin user
    const authHeader = req.headers.get("authorization") || "";
    const isInternal = req.headers.get("x-internal-secret") === SUPABASE_SERVICE_ROLE_KEY;

    // pg_cron/pg_net calls come with the anon key — allow if offset=0 (initial trigger)
    // Self-invocations use x-internal-secret header
    if (!isInternal) {
      const token = authHeader.replace("Bearer ", "");
      const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: { user } } = await supabaseAuth.auth.getUser(token);
      
      // Allow if no user (pg_cron sends anon key) and offset is 0
      if (!user && offset !== 0) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // If there IS a user, verify admin role
      if (user) {
        const { data: roles } = await supabaseAuth.from("user_roles").select("role").eq("user_id", user.id);
        if (!roles?.some(r => r.role === "admin")) {
          return new Response(JSON.stringify({ error: "Admin only" }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
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
        console.error(`[scheduled-rescore] generate-insights error: ${await resp.text()}`);
      } else {
        const result = await resp.json();
        console.log(`[scheduled-rescore] Batch done: ${result.processed} rescored`);
      }
    } catch (err) {
      console.error(`[scheduled-rescore] Insight call failed:`, err);
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
