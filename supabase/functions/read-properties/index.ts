import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const COLUMNS = [
  "id",
  "address",
  "city",
  "state",
  "zip",
  "county",
  "jurisdiction_id",
  "enforcement_type",
  "snap_score",
  "open_violations",
  "total_violations",
  "repeat_offender",
  "escalated",
  "distress_signals",
  "violation_types",
  "newest_violation_date",
  "oldest_violation_date",
  "avg_days_open",
  "multi_department",
  "opportunity_class",
  "latitude",
  "longitude",
  "created_at",
  "updated_at",
].join(",");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method !== "GET") {
    return json({ error: "Method not allowed. Use GET." }, 405);
  }

  try {
    // Auth via shared pipeline key
    const internalSecret = req.headers.get("x-internal-secret");
    const pipelineKey = Deno.env.get("PIPELINE_API_KEY");

    if (!pipelineKey || !internalSecret || internalSecret !== pipelineKey) {
      return json({ error: "Unauthorized" }, 401);
    }

    const url = new URL(req.url);
    const state = url.searchParams.get("state");
    const county = url.searchParams.get("county");
    const city = url.searchParams.get("city");
    const limitParam = url.searchParams.get("limit");
    const offsetParam = url.searchParams.get("offset");
    const limit = Math.min(parseInt(limitParam || "1000", 10), 5000);
    const offset = parseInt(offsetParam || "0", 10);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Count query
    let countQuery = supabase
      .from("properties")
      .select("*", { count: "exact", head: true });
    if (state) countQuery = countQuery.eq("state", state.toUpperCase());
    if (county) countQuery = countQuery.ilike("county", county);
    if (city) countQuery = countQuery.ilike("city", city);

    const { count, error: countError } = await countQuery;
    if (countError) throw new Error(`Count failed: ${countError.message}`);

    // Data query
    let dataQuery = supabase
      .from("properties")
      .select(COLUMNS)
      .order("created_at", { ascending: true })
      .range(offset, offset + limit - 1);
    if (state) dataQuery = dataQuery.eq("state", state.toUpperCase());
    if (county) dataQuery = dataQuery.ilike("county", county);
    if (city) dataQuery = dataQuery.ilike("city", city);

    const { data, error } = await dataQuery;
    if (error) throw new Error(`Query failed: ${error.message}`);

    return json({
      total: count ?? 0,
      offset,
      limit,
      filters: { state: state ?? "all", county: county ?? "all", city: city ?? "all" },
      rows: data ?? [],
    });
  } catch (err) {
    console.error("[read-properties]", err);
    return json({ error: (err as Error).message }, 500);
  }
});
