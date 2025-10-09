// Production-hardened bulk skip-trace with atomic transactions & refunds
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

const EDGE_BASE = Deno.env.get("SUPABASE_URL") || "";
const MAX_CONCURRENT = 5;
const DELAY_MS = 400;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
  if (!auth?.user) return resp(401, { ok: false, error: "Unauthorized" });

  try {
    const body = await req.json() as { property_ids: string[]; job_key?: string };
    
    if (!Array.isArray(body.property_ids) || body.property_ids.length === 0) {
      return resp(400, { ok: false, error: "property_ids required" });
    }

    const propertyIds = [...new Set(body.property_ids)];
    
    // Create idempotency key
    const sortedIds = [...propertyIds].sort();
    const jobKey = body.job_key || `${auth.user.id}:${sortedIds.join(",")}`;

    // Check for existing job in last 10 minutes (idempotency)
    const { data: existingJob } = await supabase
      .from("skiptrace_jobs")
      .select("*")
      .eq("job_key", jobKey)
      .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .maybeSingle();

    if (existingJob) {
      console.log("[bulk] Idempotent request, returning existing job:", existingJob.id);
      return resp(200, {
        ok: true,
        job_id: existingJob.id,
        total: propertyIds.length,
        existing: true,
      });
    }

    // Create job record
    const { data: job, error: jobError } = await supabase
      .from("skiptrace_jobs")
      .insert({
        user_id: auth.user.id,
        property_ids: propertyIds,
        job_key: jobKey,
        status: "queued",
        counts: { total: propertyIds.length, succeeded: 0, failed: 0 },
      })
      .select()
      .single();

    if (jobError || !job) {
      console.error("[bulk] Failed to create job:", jobError);
      return resp(500, { ok: false, error: "Failed to create job" });
    }

    // Atomic credit charge
    const { error: chargeError } = await supabase.rpc("fn_charge_credits", {
      p_property_ids: propertyIds,
      p_job_id: job.id,
    });

    if (chargeError) {
      // Delete job if charge failed
      await supabase.from("skiptrace_jobs").delete().eq("id", job.id);
      
      if (chargeError.message.includes("INSUFFICIENT_CREDITS")) {
        return resp(402, { ok: false, error: "Insufficient credits" });
      }
      console.error("[bulk] Credit charge failed:", chargeError);
      return resp(500, { ok: false, error: "Failed to charge credits" });
    }

    // Launch worker in background
    EdgeRuntime.waitUntil(runWorker({ jobId: job.id, token, propertyIds }));

    return resp(200, {
      ok: true,
      job_id: job.id,
      total: propertyIds.length,
    });
  } catch (error: any) {
    console.error("[bulk] error:", error);
    return resp(500, { ok: false, error: error.message || "Internal error" });
  }
});

// -------- Worker ----------
async function runWorker(opts: { jobId: string; token: string; propertyIds: string[] }) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const { jobId, token, propertyIds } = opts;

  // Update status to processing
  await supabase
    .from("skiptrace_jobs")
    .update({ status: "processing", started_at: new Date().toISOString() })
    .eq("id", jobId);

  const succeeded: string[] = [];
  const failed: string[] = [];
  const noMatch: string[] = [];

  // Process in batches
  for (let i = 0; i < propertyIds.length; i += MAX_CONCURRENT) {
    const batch = propertyIds.slice(i, i + MAX_CONCURRENT);
    
    const results = await Promise.allSettled(
      batch.map((pid, idx) => 
        callSingleSkipTrace(pid, token, DELAY_MS * idx)
      )
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
      }
    }

    // Update job counts progressively
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

    await sleep(200);
  }

  // Refund for failures and no-matches
  const toRefund = [...failed, ...noMatch];
  if (toRefund.length > 0) {
    await supabase.rpc("fn_refund_credits", {
      p_property_ids: toRefund,
      p_job_id: jobId,
      p_reason: "skiptrace_refund",
    });
  }

  // Mark job as complete
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

  console.log(`[bulk] Job ${jobId} complete: ${succeeded.length} succeeded, ${toRefund.length} refunded`);
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
    return { ok: true, noHit };
  }
  return { ok: false, noHit: false };
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function resp(status: number, body: any) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}
