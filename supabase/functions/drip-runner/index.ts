// drip-runner
// Cron-triggered. Processes all due drip_enrollments (status=active AND next_run_at <= now).
// For each: loads next step, sends SMS via direct Twilio call (using org's BYOA creds from vault),
// records the outbound message + thread, advances enrollment.
// Completes when no more steps remain. Marks failed on hard errors.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";
import { readVaultSecret } from "../_shared/byoa/vault.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const SMS_COST_USD = 0.0083;

// Sanitize a single template variable value to prevent SMS injection.
// - Strip control chars (incl. NULL, BEL, etc.) that some carriers interpret
// - Collapse whitespace
// - Hard-cap length so a malicious owner_name can't blow up the message
// - Strip Unicode bidi/format chars used in spoofing attacks
function sanitizeVar(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // Remove control chars (0x00-0x1F, 0x7F) except space; remove bidi/format chars
  s = s.replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "");
  // Collapse whitespace runs
  s = s.replace(/\s+/g, " ").trim();
  // Cap length per variable
  if (s.length > 80) s = s.slice(0, 80);
  return s;
}

function renderTemplate(tpl: string, vars: Record<string, unknown>): string {
  // Only the {{var}} pattern is interpolated. Templates themselves come from
  // org-controlled drip_steps.template_body (RLS-guarded) — variables are the
  // attacker-controlled surface, so each is sanitized at substitution time.
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => sanitizeVar(vars[k]));
}

interface SendResult {
  ok: boolean;
  sid?: string | null;
  status?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

// Cache vault reads per integration for the duration of one runner invocation.
async function sendViaTwilio(
  admin: ReturnType<typeof createClient>,
  orgId: string,
  to: string,
  body: string,
  credCache: Map<string, { account_sid: string; auth_token: string; from_number: string } | null>,
): Promise<{ result: SendResult; from_number: string | null }> {
  let creds = credCache.get(orgId);
  if (creds === undefined) {
    const { data: integ } = await admin
      .from("user_integrations")
      .select("vault_secret_id")
      .eq("org_id", orgId).eq("service_name", "twilio").eq("status", "active")
      .maybeSingle();
    if (!integ?.vault_secret_id) {
      credCache.set(orgId, null);
      return { result: { ok: false, errorCode: "no_integration", errorMessage: "No active Twilio integration for org" }, from_number: null };
    }
    try {
      const c = await readVaultSecret(admin, integ.vault_secret_id);
      if (!c?.account_sid || !c?.auth_token || !c?.from_number) {
        credCache.set(orgId, null);
        return { result: { ok: false, errorCode: "incomplete_creds", errorMessage: "Stored credentials incomplete" }, from_number: null };
      }
      creds = { account_sid: c.account_sid, auth_token: c.auth_token, from_number: c.from_number };
      credCache.set(orgId, creds);
    } catch (e) {
      credCache.set(orgId, null);
      const msg = e instanceof Error ? e.message : String(e);
      return { result: { ok: false, errorCode: "vault_error", errorMessage: msg }, from_number: null };
    }
  }
  if (creds === null) {
    return { result: { ok: false, errorCode: "no_integration", errorMessage: "No usable Twilio creds" }, from_number: null };
  }

  const formBody = new URLSearchParams({ To: to, From: creds.from_number, Body: body });
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${creds.account_sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${creds.account_sid}:${creds.auth_token}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formBody.toString(),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        result: { ok: false, sid: null, errorCode: String(data?.code ?? res.status), errorMessage: String(data?.message ?? `HTTP ${res.status}`) },
        from_number: creds.from_number,
      };
    }
    return {
      result: { ok: true, sid: data?.sid ?? null, status: data?.status ?? "sent" },
      from_number: creds.from_number,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { result: { ok: false, errorCode: "network", errorMessage: msg }, from_number: creds.from_number };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const nowIso = new Date().toISOString();
  const credCache = new Map<string, { account_sid: string; auth_token: string; from_number: string } | null>();

  // CONCURRENCY-SAFE CLAIM: uses FOR UPDATE SKIP LOCKED inside a SECURITY DEFINER
  // SQL function. Two cron ticks running in parallel will never grab the same
  // enrollment because each row is row-locked and its next_run_at is bumped
  // forward 5 minutes the moment it is claimed.
  const { data: due, error } = await admin.rpc("claim_due_drip_enrollments", { _limit: 50 });

  if (error) {
    console.error("drip-runner claim failed", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  let sent = 0, completed = 0, failed = 0;

  for (const enr of due ?? []) {
    try {
      // Get all steps for this sequence
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

      // Resolve lead context for templating
      const { data: lead } = await admin
        .from("leads")
        .select("id, property_id, owner_id, properties:property_id(address, city, state), owners:owner_id(name)")
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

        // GLOBAL suppression — checked first; cross-org STOP enforcement
        const { data: globalSup } = await admin
          .from("global_sms_suppression" as any)
          .select("phone_number")
          .eq("phone_number", enr.to_number)
          .maybeSingle();
        if (globalSup) {
          await admin.from("drip_enrollments").update({
            status: "paused", pause_reason: "global_opt_out",
          }).eq("id", enr.id);
          failed++;
          continue;
        }

        // Per-org suppression
        const { data: suppressed } = await admin
          .from("suppression_list" as any)
          .select("id")
          .eq("org_id", enr.org_id).eq("phone", enr.to_number)
          .maybeSingle();
        if (suppressed) {
          await admin.from("drip_enrollments").update({
            status: "paused", pause_reason: "opted_out",
          }).eq("id", enr.id);
          failed++;
          continue;
        }

        // Send via Twilio directly
        const { result, from_number } = await sendViaTwilio(
          admin, enr.org_id, enr.to_number, rendered, credCache,
        );

        const fromNum = from_number ?? "unknown";

        // Upsert thread
        const { data: existingThread } = await admin
          .from("sms_threads")
          .select("id")
          .eq("org_id", enr.org_id).eq("from_number", fromNum).eq("to_number", enr.to_number)
          .maybeSingle();

        let threadId = existingThread?.id as string | undefined;
        if (!threadId) {
          const { data: newThread } = await admin
            .from("sms_threads")
            .insert({
              org_id: enr.org_id, lead_id: enr.lead_id, property_id: (lead as any)?.property_id ?? null,
              from_number: fromNum, to_number: enr.to_number, status: "active",
              last_outbound_at: nowIso, last_message_preview: rendered.slice(0, 140),
            })
            .select("id").single();
          threadId = newThread?.id;
        } else {
          await admin.from("sms_threads").update({
            last_outbound_at: nowIso, last_message_preview: rendered.slice(0, 140),
            lead_id: enr.lead_id,
          }).eq("id", threadId);
        }

        // Record outbound message
        if (threadId) {
          await admin.from("sms_messages").insert({
            thread_id: threadId, org_id: enr.org_id, direction: "outbound",
            body: rendered, twilio_sid: result.sid ?? null,
            status: result.ok ? (result.status ?? "sent") : "failed",
            error_code: result.ok ? null : (result.errorCode ?? null),
            cost_cents: result.ok ? Math.round(SMS_COST_USD * 100) : null,
            drip_enrollment_id: enr.id,
            sent_at: nowIso,
          });
        }

        // Lead activity
        await admin.from("lead_activities").insert({
          lead_id: enr.lead_id, org_id: enr.org_id, actor_id: null,
          activity_type: result.ok ? "sms_outbound" : "sms_failed",
          payload: {
            to: enr.to_number, preview: rendered.slice(0, 140),
            message_sid: result.sid, thread_id: threadId,
            sequence_id: enr.sequence_id, step_order: step.step_order,
            error: result.ok ? null : result.errorMessage,
          },
        });

        if (!result.ok) {
          console.warn("drip send failed", enr.id, result.errorCode, result.errorMessage);
          // Hard-fail enrollment if creds are missing/invalid
          if (result.errorCode === "no_integration" || result.errorCode === "incomplete_creds") {
            await admin.from("drip_enrollments").update({
              status: "failed", pause_reason: result.errorCode,
            }).eq("id", enr.id);
            failed++;
            continue;
          }
        } else {
          sent++;
        }
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
