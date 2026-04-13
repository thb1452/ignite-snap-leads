/**
 * Pipeline Runner — server-side batch processor
 *
 * Iterates over `read-properties` in paginated chunks, processes each batch
 * via a caller-supplied action (or defaults to "count"), and self-invokes
 * for the next page so the work continues in the background.
 *
 * Auth: PIPELINE_API_KEY via x-internal-secret header (same as read-properties).
 *
 * POST body (all optional):
 *   action   – "count" (default) | "export" | "enrich"
 *   state    – filter by state
 *   county   – filter by county
 *   city     – filter by city
 *   limit    – page size (default 2000, max 5000)
 *   offset   – starting offset (default 0)
 *
 * Returns progress JSON after each batch. Self-invokes next page automatically.
 */
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const PAGE_SIZE_DEFAULT = 2000;

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

  // ── Auth ────────────────────────────────────────────────
  const pipelineKey = Deno.env.get("PIPELINE_API_KEY");
  const internalSecret = req.headers.get("x-internal-secret");

  if (!pipelineKey || !internalSecret || internalSecret !== pipelineKey) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action: string = body.action ?? "count";
    const state: string | undefined = body.state;
    const county: string | undefined = body.county;
    const city: string | undefined = body.city;
    const limit: number = Math.min(body.limit ?? PAGE_SIZE_DEFAULT, 5000);
    const offset: number = body.offset ?? 0;

    // Running totals carried across self-invocations
    const processed: number = body._processed ?? 0;
    const matched: number = body._matched ?? 0;

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

    // ── Fetch one page from read-properties ──────────────
    const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (state) qs.set("state", state);
    if (county) qs.set("county", county);
    if (city) qs.set("city", city);

    const pageResp = await fetch(
      `${SUPABASE_URL}/functions/v1/read-properties?${qs}`,
      { headers: { "x-internal-secret": pipelineKey } },
    );

    if (!pageResp.ok) {
      const errText = await pageResp.text();
      throw new Error(`read-properties returned ${pageResp.status}: ${errText}`);
    }

    const page = await pageResp.json();
    const rows: any[] = page.rows ?? [];
    const total: number = page.total ?? 0;

    console.log(
      `[pipeline-runner] action=${action} offset=${offset} rows=${rows.length} total=${total}`,
    );

    // ── Process batch (extensible per action) ────────────
    let batchMatched = 0;

    if (action === "count") {
      // Simple pass-through count — useful for validation
      batchMatched = rows.length;
    } else if (action === "export") {
      // Future: write rows to storage bucket or external webhook
      batchMatched = rows.length;
    } else if (action === "enrich") {
      // Future: call enrichment service per row
      batchMatched = rows.length;
    }

    const newProcessed = processed + rows.length;
    const newMatched = matched + batchMatched;
    const nextOffset = offset + limit;
    const isComplete = nextOffset >= total || rows.length === 0;

    // ── Self-invoke for next page ────────────────────────
    if (!isComplete) {
      const selfUrl = `${SUPABASE_URL}/functions/v1/pipeline-runner`;
      EdgeRuntime.waitUntil(
        fetch(selfUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": pipelineKey,
          },
          body: JSON.stringify({
            action,
            state,
            county,
            city,
            limit,
            offset: nextOffset,
            _processed: newProcessed,
            _matched: newMatched,
          }),
        }).catch((err) =>
          console.error("[pipeline-runner] Self-invoke failed:", err)
        ),
      );
      console.log(`[pipeline-runner] Queued next batch at offset ${nextOffset}`);
    } else {
      console.log(
        `[pipeline-runner] COMPLETE — processed=${newProcessed} matched=${newMatched}`,
      );
    }

    return json({
      success: true,
      action,
      complete: isComplete,
      total,
      processed: newProcessed,
      matched: newMatched,
      current_offset: offset,
      next_offset: isComplete ? null : nextOffset,
    });
  } catch (err) {
    console.error("[pipeline-runner] Error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
