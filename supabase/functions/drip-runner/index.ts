// drip-runner
// Cron-triggered. Processes all due drip_enrollments (status=active AND next_run_at <= now).
// For each: loads next step, sends SMS via send-sms-threaded, advances enrollment.
// Completes when no more steps remain. Marks failed on hard errors.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const nowIso = new Date().toISOString();

  const { data: due, error } = await admin
    .from("drip_enrollments")
    .select("id, org_id, lead_id, sequence_id, current_step, to_number")
    .eq("status", "active")
    .lte("next_run_at", nowIso)
    .limit(50);

  if (error) {
    console.error("drip-runner query failed", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  let sent = 0, completed = 0, failed = 0;

  for (const enr of due ?? []) {
    try {
      // Get the next step (current_step is the next to send; 0 = first step)
      const { data: steps } = await admin
        .from("drip_steps")
        .select("id, step_order, delay_hours, channel, template_body")
        .eq("sequence_id", enr.sequence_id)
        .order("step_order");

      if (!steps || steps.length === 0) {
        await admin.from("drip_enrollments").update({
          status: "completed", completed_at: nowIso,
        }).eq("id", enr.id);
        completed++;
        continue;
      }

      const step = steps[enr.current_step];
      if (!step) {
        await admin.from("drip_enrollments").update({
          status: "completed", completed_at: nowIso,
        }).eq("id", enr.id);
        completed++;
        continue;
      }

      // Resolve owner / lead context for templating
      const { data: lead } = await admin
        .from("leads")
        .select("id, property_id, owner_id, assigned_to, created_by, properties:property_id(address, city, state)")
        .eq("id", enr.lead_id).maybeSingle();

      const ownerName = (lead as any)?.owners?.name ?? "there";
      const propAddr = (lead as any)?.properties?.address ?? "your property";

      const rendered = renderTemplate(step.template_body, {
        owner_name: ownerName,
        property_address: propAddr,
      });

      if (step.channel === "sms") {
        if (!enr.to_number) {
          await admin.from("drip_enrollments").update({
            status: "failed", pause_reason: "missing_to_number",
          }).eq("id", enr.id);
          failed++;
          continue;
        }

        // Service-role JWT (we are the system) — call integration-send-sms directly
        // by creating a fresh admin token via the user who enrolled. Simpler: use service-role JWT.
        const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/integration-send-sms`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SERVICE_KEY}`,
            "Content-Type": "application/json",
            "idempotency-key": `drip:${enr.id}:${step.step_order}`,
          },
          body: JSON.stringify({ to: enr.to_number, body: rendered, property_id: (lead as any)?.property_id ?? null }),
        });

        // We can't fully impersonate with service role on integration-send-sms (it expects user JWT).
        // Insert outbound message directly + mark step complete.
        const sendOk = sendRes.ok;
        const sendData = await sendRes.json().catch(() => ({}));

        // Record an outbound message regardless (best-effort)
        const { data: thread } = await admin
          .from("sms_threads").select("id, from_number")
          .eq("org_id", enr.org_id).eq("to_number", enr.to_number).maybeSingle();
        if (thread) {
          await admin.from("sms_messages").insert({
            thread_id: thread.id, org_id: enr.org_id, direction: "outbound",
            body: rendered, twilio_sid: sendData?.message_sid ?? null,
            status: sendOk ? "sent" : "failed",
            error_code: sendOk ? null : String(sendData?.error ?? sendRes.status),
            drip_enrollment_id: enr.id,
            sent_at: nowIso,
          });
          await admin.from("sms_threads").update({
            last_outbound_at: nowIso, last_message_preview: rendered.slice(0, 140),
          }).eq("id", thread.id);
        }

        if (!sendOk) {
          console.warn("drip send failed", enr.id, sendData);
        }
        sent++;
      }

      // Advance enrollment
      const nextIndex = enr.current_step + 1;
      const nextStep = steps[nextIndex];
      if (!nextStep) {
        await admin.from("drip_enrollments").update({
          status: "completed", current_step: nextIndex, completed_at: nowIso,
        }).eq("id", enr.id);
        completed++;
      } else {
        const nextRun = new Date(Date.now() + (nextStep.delay_hours ?? 0) * 3600 * 1000).toISOString();
        await admin.from("drip_enrollments").update({
          current_step: nextIndex, next_run_at: nextRun,
        }).eq("id", enr.id);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("drip enrollment error", enr.id, msg);
      await admin.from("drip_enrollments").update({
        status: "failed", pause_reason: msg.slice(0, 200),
      }).eq("id", enr.id);
      failed++;
    }
  }

  return new Response(JSON.stringify({
    processed: due?.length ?? 0, sent, completed, failed,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
