// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

const EDGE_BASE = Deno.env.get("SUPABASE_URL") || "";
const MAX_CONCURRENCY = 20;
const MAX_ACTIVE_JOBS_PER_USER = 3;
const VENDOR_TIMEOUT_MS = 15000;

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
  const supabase = createClient(supabaseUrl, serviceKey);

  // Auth
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return resp(401, { ok: false, error: "Unauthorized" });
  }
  
  const token = authHeader.replace("Bearer ", "");
  const { data: auth } = await supabase.auth.getUser(token);
  const user = auth.user;
  if (!user) return resp(401, { ok: false, error: "Unauthorized" });

  const body = (await req.json()) as { property_ids: string[]; job_key?: string };
  
  if (!body.property_ids || !Array.isArray(body.property_ids) || body.property_ids.length === 0) {
    return resp(400, { ok: false, error: "property_ids[] required" });
  }

  const propertyIds = [...new Set(body.property_ids)];
  const jobKey = body.job_key || `${user.id}:${propertyIds.sort().join(",")}`;

  // Check for existing job with same key (idempotency)
  const { data: existingJob } = await supabase
    .from("skiptrace_jobs")
    .select("*")
    .eq("job_key", jobKey)
    .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .maybeSingle();

  if (existingJob) {
    console.log("[bulk] Returning existing job (idempotent):", existingJob.id);
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

  // Create job
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

  if (jobError || !newJob) {
    console.error("[bulk] Job creation error:", jobError);
    return resp(500, { ok: false, error: "Failed to create job" });
  }

  // Atomic credit charge
  try {
    const { error: chargeError } = await supabase.rpc("fn_charge_credits", {
      p_property_ids: propertyIds,
      p_job_id: newJob.id,
    });

    if (chargeError) {
      // Delete job if charge failed
      await supabase.from("skiptrace_jobs").delete().eq("id", newJob.id);
      
      if (chargeError.message === "INSUFFICIENT_CREDITS") {
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
  EdgeRuntime.waitUntil(processJob({ jobId: newJob.id, token, propertyIds }));

  return resp(200, {
    ok: true,
    job_id: newJob.id,
    total: propertyIds.length,
  });
}

// Background job processor
async function processJob(opts: { jobId: string; token: string; propertyIds: string[] }) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const { jobId, token, propertyIds } = opts;

  // Mark as processing
  await supabase
    .from("skiptrace_jobs")
    .update({ status: "processing", started_at: new Date().toISOString() })
    .eq("id", jobId);

  console.log(`[job:${jobId}] Processing ${propertyIds.length} properties`);

  const succeeded: string[] = [];
  const failed: string[] = [];
  const noMatch: string[] = [];

  // Process in batches with concurrency limit
  const batchSize = Math.min(MAX_CONCURRENCY, 10);
  
  for (let i = 0; i < propertyIds.length; i += batchSize) {
    const batch = propertyIds.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((pid, idx) => callSingleSkipTrace(pid, token, idx * 350))
    );

    for (let j = 0; j < batch.length; j++) {
      const pid = batch[j];
      const r = results[j];

      if (r.status === "fulfilled") {
        const { ok, noHit } = r.value;
        if (ok && !noHit) {
          succeeded.push(pid);
        } else if (ok && noHit) {
          noMatch.push(pid);
        } else {
          failed.push(pid);
        }
      } else {
        failed.push(pid);
        console.error(`[job:${jobId}] Property ${pid} failed:`, r.reason);
      }
    }

    // Update counts periodically
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
    } catch (e: any) {
      console.error(`[job:${jobId}] Refund error:`, e);
    }
  }

  // Mark job as finished
  await supabase
    .from("skiptrace_jobs")
    .update({
      status: "completed",
      finished_at: new Date().toISOString(),
      counts: {
        total: propertyIds.length,
        succeeded: succeeded.length,
        failed: failed.length + noMatch.length,
      },
    })
    .eq("id", jobId);

  console.log(
    `[job:${jobId}] Complete. Success: ${succeeded.length}, Failed: ${failed.length}, No Match: ${noMatch.length}, Refunded: ${toRefund.length}`
  );
}

async function callSingleSkipTrace(propertyId: string, token: string, delayMs: number) {
  if (delayMs > 0) await sleep(delayMs);

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
        ok: true, 
        noHit, 
        msg: noHit ? "no contacts" : `contacts: ${contacts.length}` 
      };
    }
    
    return { 
      ok: false, 
      noHit: false, 
      msg: json?.error || `HTTP ${res.status}` 
    };
  } catch (e: any) {
    clearTimeout(timeout);
    if (e.name === "AbortError") {
      return { ok: false, noHit: false, msg: "Vendor timeout" };
    }
    return { ok: false, noHit: false, msg: e.message || "Network error" };
  }
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function resp(status: number, body: any) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}
