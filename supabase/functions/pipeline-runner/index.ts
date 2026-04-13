/**
 * Pipeline Runner — resilient server-side batch processor
 *
 * Persists progress, retries transient failures, and resumes from last offset.
 * Auth: PIPELINE_API_KEY via x-internal-secret header.
 *
 * POST body (all optional):
 *   action   – "count" | "export" | "enrich"
 *   state, county, city – filters
 *   limit    – page size (default 2000, max 5000)
 *   offset   – starting offset (default 0, or resumes from saved)
 *   resume   – true to pick up from last saved offset
 *   _processed, _matched, _retries – internal carry-forward fields
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const PAGE_SIZE_DEFAULT = 2000;
const MAX_RETRIES_PER_BATCH = 3;
const RETRY_DELAY_MS = 5000;

// ── Progress table helper ────────────────────────────────
function getAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

interface RunState {
  action: string;
  state?: string;
  county?: string;
  city?: string;
  last_offset: number;
  processed: number;
  matched: number;
  total: number;
  status: "running" | "complete" | "failed";
  error?: string;
  updated_at: string;
}

async function loadProgress(
  supabase: ReturnType<typeof createClient>,
  runKey: string,
): Promise<RunState | null> {
  const { data } = await supabase
    .from("pipeline_progress")
    .select("*")
    .eq("run_key", runKey)
    .maybeSingle();
  return data as RunState | null;
}

async function saveProgress(
  supabase: ReturnType<typeof createClient>,
  runKey: string,
  state: Partial<RunState>,
) {
  const row = {
    run_key: runKey,
    ...state,
    updated_at: new Date().toISOString(),
  };
  await supabase.from("pipeline_progress").upsert(row, { onConflict: "run_key" });
}

function buildRunKey(action: string, state?: string, county?: string, city?: string) {
  return [action, state ?? "_", county ?? "_", city ?? "_"].join("|");
}

// ── Retry wrapper ────────────────────────────────────────
async function fetchWithRetry(
  url: string,
  opts: RequestInit,
  maxRetries: number,
): Promise<Response> {
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, opts);
      if (resp.ok || resp.status < 500) return resp; // non-transient = don't retry
      const body = await resp.text();
      lastErr = new Error(`HTTP ${resp.status}: ${body}`);
      console.warn(
        `[pipeline-runner] Transient ${resp.status} on attempt ${attempt}/${maxRetries}`,
      );
    } catch (err) {
      lastErr = err as Error;
      console.warn(
        `[pipeline-runner] Network error attempt ${attempt}/${maxRetries}: ${lastErr.message}`,
      );
    }
    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
    }
  }
  throw lastErr ?? new Error("fetchWithRetry exhausted");
}

// ── Main handler ─────────────────────────────────────────
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

  // ── Auth ───────────────────────────────────────────────
  const pipelineKey = Deno.env.get("PIPELINE_API_KEY");
  const internalSecret = req.headers.get("x-internal-secret");
  if (!pipelineKey || !internalSecret || internalSecret !== pipelineKey) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = getAdminClient();

  try {
    const body = await req.json().catch(() => ({}));
    const action: string = body.action ?? "count";
    const state: string | undefined = body.state;
    const county: string | undefined = body.county;
    const city: string | undefined = body.city;
    const limit: number = Math.min(body.limit ?? PAGE_SIZE_DEFAULT, 5000);
    const resume: boolean = body.resume === true;

    const runKey = buildRunKey(action, state, county, city);

    // Carry-forward or resume from persisted progress
    let offset: number = body.offset ?? 0;
    let processed: number = body._processed ?? 0;
    let matched: number = body._matched ?? 0;
    let batchRetries: number = body._retries ?? 0;

    if (resume && offset === 0 && processed === 0) {
      const saved = await loadProgress(supabase, runKey);
      if (saved && saved.status === "running") {
        offset = saved.last_offset;
        processed = saved.processed;
        matched = saved.matched;
        console.log(
          `[pipeline-runner] RESUMING ${runKey} from offset=${offset} processed=${processed}`,
        );
      }
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

    // ── Fetch one page ───────────────────────────────────
    const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (state) qs.set("state", state);
    if (county) qs.set("county", county);
    if (city) qs.set("city", city);

    console.log(`[pipeline-runner] BATCH START action=${action} offset=${offset} limit=${limit}`);

    let pageResp: Response;
    try {
      pageResp = await fetchWithRetry(
        `${SUPABASE_URL}/functions/v1/read-properties?${qs}`,
        { headers: { "x-internal-secret": pipelineKey } },
        MAX_RETRIES_PER_BATCH,
      );
    } catch (err) {
      const msg = (err as Error).message;
      console.error(`[pipeline-runner] BATCH FAILED offset=${offset} after ${MAX_RETRIES_PER_BATCH} retries: ${msg}`);
      await saveProgress(supabase, runKey, {
        action, state, county, city,
        last_offset: offset, processed, matched, total: 0,
        status: "failed", error: msg,
      });
      return json({
        success: false, action, error: msg,
        offset, processed, matched, retries_exhausted: true,
      }, 502);
    }

    if (!pageResp.ok) {
      const errText = await pageResp.text();
      throw new Error(`read-properties returned ${pageResp.status}: ${errText}`);
    }

    const page = await pageResp.json();
    const rows: any[] = page.rows ?? [];
    const total: number = page.total ?? 0;

    // ── Process batch ────────────────────────────────────
    let batchMatched = rows.length; // all actions currently count rows

    const newProcessed = processed + rows.length;
    const newMatched = matched + batchMatched;
    const nextOffset = offset + limit;
    const isComplete = nextOffset >= total || rows.length === 0;

    console.log(
      `[pipeline-runner] BATCH SUCCESS offset=${offset} rows=${rows.length} total=${total} processed=${newProcessed} complete=${isComplete}`,
    );

    // ── Persist progress ─────────────────────────────────
    await saveProgress(supabase, runKey, {
      action, state, county, city,
      last_offset: isComplete ? offset : nextOffset,
      processed: newProcessed,
      matched: newMatched,
      total,
      status: isComplete ? "complete" : "running",
    });

    // ── Self-invoke for next page ────────────────────────
    if (!isComplete) {
      const selfUrl = `${SUPABASE_URL}/functions/v1/pipeline-runner`;
      console.log(`[pipeline-runner] NEXT BATCH offset=${nextOffset}`);
      EdgeRuntime.waitUntil(
        fetch(selfUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": pipelineKey,
          },
          body: JSON.stringify({
            action, state, county, city, limit,
            offset: nextOffset,
            _processed: newProcessed,
            _matched: newMatched,
            _retries: 0,
          }),
        }).catch((err) =>
          console.error("[pipeline-runner] Self-invoke failed:", err),
        ),
      );
    } else {
      console.log(
        `[pipeline-runner] COMPLETE processed=${newProcessed} matched=${newMatched}`,
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
