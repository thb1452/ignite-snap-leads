import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const VALID_STATUSES = ["traced", "bad", "opt-out", "ready-to-text"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") {
    return json({ error: "Method not allowed. Use POST." }, 405);
  }

  try {
    // Auth
    const internalSecret = req.headers.get("x-internal-secret");
    const pipelineKey = Deno.env.get("PIPELINE_API_KEY");

    if (!pipelineKey || !internalSecret || internalSecret !== pipelineKey) {
      return json({ error: "Unauthorized" }, 401);
    }

    // Parse body
    const body = await req.json();
    const { id, status, phone_number, phone_type, trace_attempted_at, trace_source, notes } = body;

    if (!id) {
      return json({ error: "Missing required field: id" }, 400);
    }

    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return json(
        { error: `Invalid status "${status}". Valid values: ${VALID_STATUSES.join(", ")}` },
        400
      );
    }

    // Build update payload – only include provided fields
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (status !== undefined) updates.status = status;
    if (phone_number !== undefined) updates.phone = phone_number;
    if (phone_type !== undefined) updates.phone_type = phone_type;
    if (trace_attempted_at !== undefined) updates.trace_attempted_at = trace_attempted_at;
    if (trace_source !== undefined) updates.trace_source = trace_source;
    if (notes !== undefined) updates.notes = notes;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data, error } = await supabase
      .from("campaign_leads")
      .update(updates)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) {
      throw new Error(`Update failed: ${error.message}`);
    }

    if (!data) {
      return json({ error: `No campaign_lead found with id "${id}"` }, 404);
    }

    return json({ ok: true, row: data });
  } catch (err) {
    console.error("[update-campaign-lead]", err);
    return json({ error: (err as Error).message }, 500);
  }
});
