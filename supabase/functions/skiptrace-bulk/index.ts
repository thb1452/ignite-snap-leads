// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

type BulkReq =
  | { list_id: string; limit?: number; concurrency?: number; delay_ms?: number; resume_run_id?: string | null }
  | { property_ids: string[]; concurrency?: number; delay_ms?: number };

const EDGE_BASE = Deno.env.get("SUPABASE_URL") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === "GET" && url.pathname.endsWith("/status")) {
    return statusHandler(req);
  }

  if (req.method === "POST") {
    return startHandler(req);
  }

  return new Response(JSON.stringify({ ok: false, error: "Not found" }), { status: 404, headers: corsHeaders });
});

async function startHandler(req: Request): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // auth
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return resp(401, { ok: false, error: "Unauthorized" });
  const token = authHeader.replace("Bearer ", "");
  const { data: auth } = await supabase.auth.getUser(token);
  const user = auth.user;
  if (!user) return resp(401, { ok: false, error: "Unauthorized" });

  const body = (await req.json()) as BulkReq;

  // 1) Resolve property ids
  let propertyIds: string[] = [];
  let fromListId: string | null = null;

  if ("property_ids" in body && Array.isArray(body.property_ids)) {
    propertyIds = [...new Set(body.property_ids)];
  } else if ("list_id" in body && body.list_id) {
    fromListId = body.list_id;
    const limit = "limit" in body && body.limit ? body.limit : 5000;
    const { data, error } = await supabase
      .rpc("fn_properties_untraced_in_list", { p_list_id: fromListId, p_limit: limit });
    if (error) {
      console.error("[bulk] Error loading list properties:", error);
      return resp(400, { ok: false, error: "Failed to load list properties" });
    }
    propertyIds = (data as { property_id: string }[]).map(r => r.property_id);
  } else {
    return resp(400, { ok: false, error: "Provide list_id or property_ids[]" });
  }

  if (propertyIds.length === 0) {
    return resp(200, { ok: true, run_id: null, total: 0, queued: 0, est_credits: 0 });
  }

  const concurrency = Math.min(Math.max(("concurrency" in body ? (body as any).concurrency : 3) || 3, 1), 6);
  const delayMs = Math.min(Math.max(("delay_ms" in body ? (body as any).delay_ms : 350) || 350, 100), 1500);

  // 2) Create run
  const runId = (body as any).resume_run_id ?? `bulk_${new Date().toISOString().slice(0,19).replace(/[:T]/g,"")}_${cryptoRandom(4)}`;
  const settings = { concurrency, delayMs, fromListId, total: propertyIds.length };

  // idempotent upsert of run
  await supabase.from("skiptrace_bulk_runs").upsert({
    run_id: runId,
    user_id: user.id,
    list_id: fromListId,
    total: propertyIds.length,
    queued: 0,
    settings,
  });

  // 3) Insert queued items (ignore if exists)
  const items = propertyIds.map(pid => ({ run_id: runId, property_id: pid, status: "queued" }));
  // chunk inserts (500 max)
  for (let i = 0; i < items.length; i += 500) {
    await supabase.from("skiptrace_bulk_items").upsert(items.slice(i, i + 500), { ignoreDuplicates: true });
  }

  // 4) Launch workers (fire-and-forget)
  queueMicrotask(() => runWorker({ runId, token, concurrency, delayMs }));

  return resp(200, {
    ok: true,
    run_id: runId,
    total: propertyIds.length,
    queued: propertyIds.length,
    started_at: new Date().toISOString(),
    est_credits: propertyIds.length,
    progress_url: `/skiptrace-bulk/status?run_id=${runId}`,
  });
}

async function statusHandler(req: Request): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const url = new URL(req.url);
  const runId = url.searchParams.get("run_id");
  if (!runId) return resp(400, { ok: false, error: "run_id required" });

  const { data: run } = await supabase.from("skiptrace_bulk_runs").select("*").eq("run_id", runId).single();
  const { data: items } = await supabase
    .from("skiptrace_bulk_items")
    .select("status")
    .eq("run_id", runId);

  const byStatus: Record<string, number> = {};
  (items ?? []).forEach((r: any) => {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  });

  return resp(200, {
    ok: true,
    run: run ?? null,
    by_status: byStatus,
    finished: !!run?.finished_at,
  });
}

// -------- Worker ----------
async function runWorker(opts: { runId: string; token: string; concurrency: number; delayMs: number }) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const { runId, token, concurrency, delayMs } = opts;

  const nextBatch = async () => {
    const { data: rows } = await supabase
      .from("skiptrace_bulk_items")
      .select("property_id")
      .eq("run_id", runId)
      .eq("status", "queued")
      .limit(concurrency);

    return (rows ?? []).map((r: any) => r.property_id);
  };

  while (true) {
    const batch = await nextBatch();
    if (batch.length === 0) {
      await supabase.from("skiptrace_bulk_runs").update({ finished_at: new Date().toISOString() }).eq("run_id", runId);
      break;
    }

    // mark processing
    await supabase
      .from("skiptrace_bulk_items")
      .update({ status: "processing" })
      .in("property_id", batch)
      .eq("run_id", runId);

    const startTs = Date.now();
    const results = await Promise.allSettled(
      batch.map((pid, idx) => callSingleSkipTrace(pid, token, delayMs * idx))
    );

    for (let i = 0; i < batch.length; i++) {
      const pid = batch[i];
      const r = results[i];
      const duration = Date.now() - startTs;

      if (r.status === "fulfilled") {
        const { ok, noHit, msg } = r.value;
        if (ok && !noHit) {
          await supabase.from("skiptrace_bulk_items").update({
            status: "success", message: msg, duration_ms: duration
          }).eq("run_id", runId).eq("property_id", pid);
          await supabase.rpc("fn_bulk_run_inc", { p_run_id: runId, p_field: "succeeded" });
        } else if (ok && noHit) {
          await supabase.from("skiptrace_bulk_items").update({
            status: "no_hit", message: msg, duration_ms: duration
          }).eq("run_id", runId).eq("property_id", pid);
        } else {
          await supabase.from("skiptrace_bulk_items").update({
            status: "error", message: msg, duration_ms: duration
          }).eq("run_id", runId).eq("property_id", pid);
          await supabase.rpc("fn_bulk_run_inc", { p_run_id: runId, p_field: "failed" });
        }
      } else {
        await supabase.from("skiptrace_bulk_items").update({
          status: "error", message: String(r.reason), duration_ms: duration
        }).eq("run_id", runId).eq("property_id", pid);
        await supabase.rpc("fn_bulk_run_inc", { p_run_id: runId, p_field: "failed" });
      }
    }

    await sleep(200);
  }
}

async function callSingleSkipTrace(propertyId: string, token: string, waitMs: number) {
  if (waitMs > 0) await sleep(waitMs);
  const endpoint = `${EDGE_BASE}/functions/v1/skiptrace`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ property_id: propertyId }),
  });

  const json = await res.json().catch(() => ({}));
  if (res.ok && json?.ok) {
    const contacts = json.contacts ?? [];
    const noHit = !contacts || contacts.length === 0;
    return { ok: true, noHit, msg: noHit ? "no contacts" : `contacts: ${contacts.length}` };
  }
  return { ok: false, noHit: false, msg: json?.error || `HTTP ${res.status}` };
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function cryptoRandom(len = 4) { return crypto.getRandomValues(new Uint8Array(len)).reduce((a,b)=>a+((b%36).toString(36)), ""); }

function resp(status: number, body: any) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}
