// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

const EDGE_BASE = Deno.env.get("SUPABASE_URL") || "";
const MAX_CONCURRENCY = 20;
const MAX_ACTIVE_JOBS_PER_USER = 3;
const VENDOR_TIMEOUT_MS = 15000;
const RETRY_DELAYS = [1000, 4000, 10000]; // Backoff: 1s, 4s, 10s
const COUNT_UPDATE_THROTTLE_MS = 500;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === "POST") {
    return startJobHandler(req);
  }

  return new Response(JSON.stringify({ ok: false, error: "Not found" }), { 
    status: 404, 
    headers: corsHeaders 
  });
});

async function startJobHandler(req: Request): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  
  // Forward auth header for cleaner auth pattern
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return resp(401, { ok: false, error: "Unauthorized" });
  }
  
  const supabase = createClient(supabaseUrl, serviceKey, {
    global: { headers: { Authorization: authHeader } }
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return resp(401, { ok: false, error: "Unauthorized" });

  const body = (await req.json()) as { property_ids: string[]; job_key?: string };
  
  if (!body.property_ids || !Array.isArray(body.property_ids) || body.property_ids.length === 0) {
    return resp(400, { ok: false, error: "property_ids[] required" });
  }

  const propertyIds = [...new Set(body.property_ids)];
  const jobKey = body.job_key || `${user.id}:${propertyIds.sort().join(",")}`;

  // Check for existing job with same key (idempotency)
  const { data: existingJob, error: existingError } = await supabase
    .from("skiptrace_jobs")
    .select("*")
    .eq("job_key", jobKey)
    .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .maybeSingle();

  if (existingJob) {
    console.log("[bulk] Returning existing job (idempotent):", existingJob.id);
    emitEvent("job_idempotent", { job_id: existingJob.id, user_id: user.id });
    return resp(200, { 
      ok: true, 
      job_id: existingJob.id, 
      total: propertyIds.length,
      idempotency: true 
    });
  }

  // Check max active jobs per user
  const { data: activeJobs, error: activeError } = await supabase
    .from("skiptrace_jobs")
    .select("id")
    .eq("user_id", user.id)
    .in("status", ["queued", "processing"]);

  if (activeError) {
    console.error("[bulk] Error checking active jobs:", activeError);
    return resp(500, { ok: false, error: "Failed to check active jobs" });
  }

  if (activeJobs && activeJobs.length >= MAX_ACTIVE_JOBS_PER_USER) {
    return resp(429, { 
      ok: false, 
      error: `Maximum ${MAX_ACTIVE_JOBS_PER_USER} active jobs allowed. Please wait for existing jobs to complete.` 
    });
  }

  // Create job (handle unique constraint race)
  const { data: newJob, error: jobError } = await supabase
    .from("skiptrace_jobs")
    .insert({
      user_id: user.id,
      property_ids: propertyIds,
      job_key: jobKey,
      status: "queued",
      counts: { total: propertyIds.length, succeeded: 0, failed: 0 },
    })
    .select()
    .single();

  if (jobError) {
    // Check if it's a unique constraint violation (race condition)
    if (jobError.code === "23505") {
      const { data: raceJob } = await supabase
        .from("skiptrace_jobs")
        .select("*")
        .eq("job_key", jobKey)
        .maybeSingle();
      
      if (raceJob) {
        console.log("[bulk] Race condition: returning existing job", raceJob.id);
        emitEvent("job_race_condition", { job_id: raceJob.id, user_id: user.id });
        return resp(200, { ok: true, job_id: raceJob.id, total: propertyIds.length, idempotency: true });
      }
    }
    console.error("[bulk] Job creation error:", jobError);
    return resp(500, { ok: false, error: "Failed to create job" });
  }
  
  if (!newJob) {
    return resp(500, { ok: false, error: "Failed to create job" });
  }
  
  emitEvent("job_queued", { job_id: newJob.id, user_id: user.id, total: propertyIds.length });

  // Atomic credit charge with proper error code checking
  try {
    const { error: chargeError } = await supabase.rpc("fn_charge_credits", {
      p_property_ids: propertyIds,
      p_job_id: newJob.id,
    });

    if (chargeError) {
      // Delete job if charge failed
      await supabase.from("skiptrace_jobs").delete().eq("id", newJob.id);
      
      // Check error code detail instead of message
      if (chargeError.details === "INSUFFICIENT_CREDITS") {
        emitEvent("job_insufficient_credits", { job_id: newJob.id, user_id: user.id });
        return resp(402, { ok: false, error: "Insufficient credits" });
      }
      
      console.error("[bulk] Charge error:", chargeError);
      return resp(500, { ok: false, error: "Failed to charge credits" });
    }
  } catch (e: any) {
    await supabase.from("skiptrace_jobs").delete().eq("id", newJob.id);
    console.error("[bulk] Charge exception:", e);
    return resp(500, { ok: false, error: e.message || "Failed to charge credits" });
  }

  // Start job processing (background)
  const token = authHeader.replace("Bearer ", "");
  EdgeRuntime.waitUntil(processJob({ jobId: newJob.id, token, propertyIds, userId: user.id }));

  return resp(200, {
    ok: true,
    job_id: newJob.id,
    total: propertyIds.length,
  });
}

// Background job processor
async function processJob(opts: { jobId: string; token: string; propertyIds: string[]; userId: string }) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const { jobId, token, propertyIds, userId } = opts;

  // Mark as processing
  await supabase
    .from("skiptrace_jobs")
    .update({ status: "processing", started_at: new Date().toISOString() })
    .eq("id", jobId);

  emitEvent("job_started", { job_id: jobId, user_id: userId, total: propertyIds.length });
  console.log(`[job:${jobId}] Processing ${propertyIds.length} properties`);

  const succeeded: string[] = [];
  const failed: string[] = [];
  const noMatch: string[] = [];
  let lastCountUpdate = 0;

  // Process in batches with concurrency limit
  const batchSize = Math.min(MAX_CONCURRENCY, 10);
  
  for (let i = 0; i < propertyIds.length; i += batchSize) {
    const batch = propertyIds.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((pid, idx) => callSingleSkipTraceWithRetry(pid, token, idx * 350))
    );

    for (let j = 0; j < batch.length; j++) {
      const pid = batch[j];
      const r = results[j];

      if (r.status === "fulfilled") {
        const { status, noHit } = r.value;
        if (status === "success") {
          succeeded.push(pid);
        } else if (status === "no_match") {
          noMatch.push(pid);
        } else {
          failed.push(pid);
        }
      } else {
        failed.push(pid);
        console.error(`[job:${jobId}] Property ${pid} failed:`, r.reason);
      }
    }

    // Throttled count update (max once per 500ms)
    const now = Date.now();
    if (now - lastCountUpdate > COUNT_UPDATE_THROTTLE_MS) {
      await supabase
        .from("skiptrace_jobs")
        .update({
          counts: {
            total: propertyIds.length,
            succeeded: succeeded.length,
            failed: failed.length + noMatch.length,
          },
        })
        .eq("id", jobId);
      lastCountUpdate = now;
      
      emitEvent("job_progress", { 
        job_id: jobId, 
        user_id: userId, 
        succeeded: succeeded.length, 
        failed: failed.length + noMatch.length 
      });
    }
  }

  // Refund for failed + no-match
  const toRefund = [...failed, ...noMatch];
  if (toRefund.length > 0) {
    try {
      await supabase.rpc("fn_refund_credits", {
        p_property_ids: toRefund,
        p_job_id: jobId,
        p_reason: "skiptrace_refund",
      });
      console.log(`[job:${jobId}] Refunded ${toRefund.length} credits`);
      emitEvent("job_refunded", { job_id: jobId, user_id: userId, count: toRefund.length });
    } catch (e: any) {
      console.error(`[job:${jobId}] Refund error:`, e);
    }
  }

  // Determine final status
  let finalStatus = "completed";
  if (succeeded.length === 0 && (failed.length > 0 || noMatch.length > 0)) {
    finalStatus = "failed";
  } else if (succeeded.length > 0 && (failed.length > 0 || noMatch.length > 0)) {
    finalStatus = "partial";
  }

  // Mark job as finished
  await supabase
    .from("skiptrace_jobs")
    .update({
      status: finalStatus,
      finished_at: new Date().toISOString(),
      counts: {
        total: propertyIds.length,
        succeeded: succeeded.length,
        failed: failed.length + noMatch.length,
      },
    })
    .eq("id", jobId);

  emitEvent("job_done", { 
    job_id: jobId, 
    user_id: userId, 
    status: finalStatus,
    succeeded: succeeded.length, 
    failed: failed.length + noMatch.length 
  });

  console.log(
    `[job:${jobId}] ${finalStatus.toUpperCase()}. Success: ${succeeded.length}, Failed: ${failed.length}, No Match: ${noMatch.length}, Refunded: ${toRefund.length}`
  );
}

// Retry wrapper with exponential backoff
async function callSingleSkipTraceWithRetry(propertyId: string, token: string, delayMs: number) {
  if (delayMs > 0) await sleep(delayMs);

  for (let attempt = 0; attempt < RETRY_DELAYS.length + 1; attempt++) {
    const result = await callSingleSkipTrace(propertyId, token);
    
    // Success or no_match: return immediately
    if (result.status === "success" || result.status === "no_match") {
      return result;
    }
    
    // Vendor error and not final attempt: retry with backoff
    if (result.status === "vendor_error" && attempt < RETRY_DELAYS.length) {
      console.log(`[retry] Property ${propertyId} attempt ${attempt + 1} failed, retrying...`);
      await sleep(RETRY_DELAYS[attempt]);
      continue;
    }
    
    // Final attempt or timeout: return failure
    return result;
  }
  
  return { status: "failed", noHit: false, msg: "Max retries exceeded" };
}

async function callSingleSkipTrace(propertyId: string, token: string) {
  const endpoint = `${EDGE_BASE}/functions/v1/skiptrace`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VENDOR_TIMEOUT_MS);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        Authorization: `Bearer ${token}` 
      },
      body: JSON.stringify({ property_id: propertyId }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const json = await res.json().catch(() => ({}));
    
    if (res.ok && json?.ok) {
      const contacts = json.contacts ?? [];
      const noHit = !contacts || contacts.length === 0;
      return { 
        status: noHit ? "no_match" : "success",
        noHit, 
        msg: noHit ? "no contacts" : `contacts: ${contacts.length}` 
      };
    }
    
    return { 
      status: "vendor_error",
      noHit: false, 
      msg: json?.error || `HTTP ${res.status}` 
    };
  } catch (e: any) {
    clearTimeout(timeout);
    if (e.name === "AbortError") {
      return { status: "timeout", noHit: false, msg: "Vendor timeout" };
    }
    return { status: "vendor_error", noHit: false, msg: e.message || "Network error" };
  }
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function emitEvent(name: string, data: any) {
  console.log(`[EVENT:${name}]`, JSON.stringify(data));
}

function resp(status: number, body: any) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}
