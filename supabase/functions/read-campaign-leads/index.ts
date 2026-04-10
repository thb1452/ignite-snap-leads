import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Authenticate: require the custom pipeline API key
    const internalSecret = req.headers.get("x-internal-secret");
    const pipelineKey = Deno.env.get("PIPELINE_API_KEY");

    if (!pipelineKey || !internalSecret || internalSecret !== pipelineKey) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "queued";
    const limitParam = url.searchParams.get("limit");
    const offsetParam = url.searchParams.get("offset");
    const limit = Math.min(parseInt(limitParam || "100", 10), 1000);
    const offset = parseInt(offsetParam || "0", 10);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Get total count
    const { count, error: countError } = await supabase
      .from("campaign_leads")
      .select("*", { count: "exact", head: true })
      .eq("status", status);

    if (countError) {
      throw new Error(`Count query failed: ${countError.message}`);
    }

    // Fetch rows
    const { data, error } = await supabase
      .from("campaign_leads")
      .select("*")
      .eq("status", status)
      .order("created_at", { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Query failed: ${error.message}`);
    }

    return new Response(
      JSON.stringify({
        total: count ?? 0,
        offset,
        limit,
        status,
        rows: data ?? [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[read-campaign-leads]", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
