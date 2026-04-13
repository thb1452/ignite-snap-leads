/**
 * test-pipeline — server-side harness that triggers pipeline-runner.
 * PIPELINE_API_KEY stays in env; never leaves the server.
 *
 * POST body (optional): { action, state, county, city, limit }
 */
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body, null, 2), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "count";
    const state = body.state ?? "OH";
    const limit = body.limit ?? 2000;

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const PIPELINE_API_KEY = Deno.env.get("PIPELINE_API_KEY");

    if (!PIPELINE_API_KEY) {
      return json({ error: "PIPELINE_API_KEY not configured" }, 500);
    }

    // ── Step 1: count ──────────────────────────────────────
    const countResp = await fetch(
      `${SUPABASE_URL}/functions/v1/pipeline-runner`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": PIPELINE_API_KEY,
        },
        body: JSON.stringify({
          action: "count",
          state,
          limit,
          ...(body.county ? { county: body.county } : {}),
          ...(body.city ? { city: body.city } : {}),
        }),
      },
    );

    const countResult = await countResp.json();

    if (!countResp.ok) {
      return json({ step: "count", error: countResult }, countResp.status);
    }

    // If caller only wanted count, return now
    if (action === "count") {
      return json({ step: "count", result: countResult });
    }

    // ── Step 2: export ─────────────────────────────────────
    const exportResp = await fetch(
      `${SUPABASE_URL}/functions/v1/pipeline-runner`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": PIPELINE_API_KEY,
        },
        body: JSON.stringify({
          action: "export",
          state,
          limit,
          ...(body.county ? { county: body.county } : {}),
          ...(body.city ? { city: body.city } : {}),
        }),
      },
    );
    const exportResult = await exportResp.json();

    if (action === "export") {
      return json({
        steps: [
          { step: "count", result: countResult },
          { step: "export", result: exportResult },
        ],
      });
    }

    // ── Step 3: enrich ─────────────────────────────────────
    const enrichResp = await fetch(
      `${SUPABASE_URL}/functions/v1/pipeline-runner`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": PIPELINE_API_KEY,
        },
        body: JSON.stringify({
          action: "enrich",
          state,
          limit,
          ...(body.county ? { county: body.county } : {}),
          ...(body.city ? { city: body.city } : {}),
        }),
      },
    );
    const enrichResult = await enrichResp.json();

    return json({
      steps: [
        { step: "count", result: countResult },
        { step: "export", result: exportResult },
        { step: "enrich", result: enrichResult },
      ],
    });
  } catch (err) {
    console.error("[test-pipeline] Error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
