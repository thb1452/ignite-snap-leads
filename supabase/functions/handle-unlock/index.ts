// Supabase Edge Function: Handle Property Unlock
// Route: POST /handle-unlock { property_id: string }
// Checks free unlocks → credits → returns error with purchase options

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const headers = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("SERVER_MISCONFIGURED");
    }

    // Auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers,
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser(token);

    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers,
      });
    }

    // Input
    const { property_id } = await req.json();
    if (!property_id) {
      return new Response(
        JSON.stringify({ error: "property_id required" }),
        { status: 400, headers }
      );
    }

    // Call the SECURITY DEFINER function
    const { data, error } = await supabase.rpc("fn_unlock_property", {
      p_user_id: user.id,
      p_property_id: property_id,
    });

    if (error) {
      console.error("[handle-unlock] RPC error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to unlock property" }),
        { status: 500, headers }
      );
    }

    const result = data as Record<string, any>;

    if (!result.success) {
      // Return 402 Payment Required with balance info
      return new Response(
        JSON.stringify({
          error: result.error,
          free_remaining: result.free_remaining ?? 0,
          credits: result.credits ?? 0,
          message:
            "No free unlocks or credits remaining. Purchase credits or subscribe to unlock.",
        }),
        { status: 402, headers }
      );
    }

    // On success, fetch full property details (including street_number)
    const { data: property, error: propErr } = await supabase
      .from("properties")
      .select(
        "id, address, street_number, street_name, city, state, zip, latitude, longitude, snap_score, snap_insight, total_violations, open_violations, opportunity_class, investor_insight_brief, violation_types, distress_signals"
      )
      .eq("id", property_id)
      .single();

    if (propErr) {
      console.error("[handle-unlock] Error fetching property:", propErr);
    }

    // Also fetch any existing contacts
    const { data: contacts } = await supabase
      .from("property_contacts")
      .select("name, phone, email, source")
      .eq("property_id", property_id);

    return new Response(
      JSON.stringify({
        success: true,
        source: result.source,
        free_remaining: result.free_remaining,
        credits_remaining: result.credits_remaining,
        property: property ?? null,
        contacts: contacts ?? [],
      }),
      { headers }
    );
  } catch (e: any) {
    console.error("[handle-unlock] error:", e?.message ?? e);
    return new Response(
      JSON.stringify({ error: e?.message ?? "Internal error" }),
      { status: 500, headers }
    );
  }
});
