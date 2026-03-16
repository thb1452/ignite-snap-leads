import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // SECURITY: Require internal secret or admin JWT
    const internalSecret = req.headers.get("x-internal-secret");
    if (!internalSecret || internalSecret !== SERVICE_ROLE_KEY) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const authClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.replace("Bearer ", "");
      const { data: authData, error: authError } = await authClient.auth.getUser(token);
      if (authError || !authData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      const { data: roleData } = await adminClient.from("user_roles").select("role").eq("user_id", authData.user.id).eq("role", "admin").maybeSingle();
      if (!roleData) {
        return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({}));
    const city = body.city || null;
    const state = body.state || null;
    const batchSize = body.batchSize || 200;

    console.log(`[backfill-zips] Starting: city=${city}, state=${state}, batch=${batchSize}`);

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

    if (data.updated > 0 && data.remaining_with_coords > 0) {
      const nextUrl = `${SUPABASE_URL}/functions/v1/backfill-zips`;
      console.log(`[backfill-zips] Continuing: ${data.remaining_with_coords} remaining`);
      const promise = fetch(nextUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': SERVICE_ROLE_KEY,
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
