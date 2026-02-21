import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({}));
    const city = body.city || null;
    const state = body.state || null;
    const batchSize = body.batchSize || 200;

    console.log(`[backfill-zips] Starting: city=${city}, state=${state}, batch=${batchSize}`);

    // Use city-scoped centroid function for multi-ZIP cities
    const { data, error } = await supabase.rpc('fn_backfill_zips_by_city_centroids', {
      p_city: city,
      p_state: state,
      p_batch_size: batchSize,
    });

    if (error) {
      console.error('[backfill-zips] RPC error:', error.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[backfill-zips] Result:', JSON.stringify(data));

    // Self-invoke for next batch if there are more
    if (data.updated > 0 && data.remaining_with_coords > 0) {
      const nextUrl = `${SUPABASE_URL}/functions/v1/backfill-zips`;
      console.log(`[backfill-zips] Continuing: ${data.remaining_with_coords} remaining`);
      const promise = fetch(nextUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ city, state, batchSize }),
      });
      
      if (typeof (globalThis as any).EdgeRuntime !== 'undefined') {
        (globalThis as any).EdgeRuntime.waitUntil(promise);
      }
    } else {
      console.log('[backfill-zips] Complete for', city, state);
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[backfill-zips] Error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
