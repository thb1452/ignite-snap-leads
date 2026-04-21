// send-sms-threaded
// Wraps integration-send-sms: sends an SMS via the org's BYOA Twilio,
// then upserts an sms_threads row and inserts an outbound sms_messages row.
//
// Body: { lead_id?: uuid, property_id?: uuid, to: string, body: string,
//         recipient_zip?: string, recipient_state?: string, drip_enrollment_id?: uuid }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, idempotency-key",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Authenticate
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  const { data: authData, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !authData?.user) return json({ error: "Unauthorized" }, 401);
  const userId = authData.user.id;

  const { data: profile } = await admin
    .from("profiles").select("org_id").eq("user_id", userId).maybeSingle();
  if (!profile?.org_id) return json({ error: "No org" }, 400);
  const orgId = profile.org_id as string;

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const { lead_id, property_id, to, body: msgBody, recipient_zip, recipient_state, drip_enrollment_id } = body ?? {};
  if (!to || !msgBody) return json({ error: "to and body required" }, 400);

  // Forward to integration-send-sms (handles Twilio, compliance, idempotency, spend cap)
  const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/integration-send-sms`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
      ...(req.headers.get("idempotency-key") ? { "idempotency-key": req.headers.get("idempotency-key")! } : {}),
    },
    body: JSON.stringify({ to, body: msgBody, property_id, recipient_zip, recipient_state }),
  });
  const sendJson = await sendRes.json().catch(() => ({}));
  if (!sendRes.ok) return json({ error: "send_failed", detail: sendJson }, sendRes.status);

  // Resolve from_number from active integration display_metadata
  const { data: integ } = await admin
    .from("user_integrations")
    .select("display_metadata")
    .eq("org_id", orgId).eq("service_name", "twilio").maybeSingle();
  const fromNumber = (integ?.display_metadata as any)?.from_number ?? "unknown";

  // Upsert thread (org_id + from_number + to_number unique)
  const nowIso = new Date().toISOString();
  const preview = msgBody.slice(0, 140);

  const { data: existing } = await admin
    .from("sms_threads")
    .select("id")
    .eq("org_id", orgId).eq("from_number", fromNumber).eq("to_number", to)
    .maybeSingle();

  let threadId = existing?.id as string | undefined;
  if (!threadId) {
    const { data: newThread, error: tErr } = await admin
      .from("sms_threads")
      .insert({
        org_id: orgId, lead_id: lead_id ?? null, property_id: property_id ?? null,
        from_number: fromNumber, to_number: to, status: "active",
        last_outbound_at: nowIso, last_message_preview: preview, created_by: userId,
      })
      .select("id").single();
    if (tErr) return json({ error: "thread_create_failed", detail: tErr.message }, 500);
    threadId = newThread.id;
  } else {
    await admin.from("sms_threads")
      .update({ last_outbound_at: nowIso, last_message_preview: preview, lead_id: lead_id ?? undefined })
      .eq("id", threadId);
  }

  // Insert outbound message
  const { data: msg, error: mErr } = await admin
    .from("sms_messages")
    .insert({
      thread_id: threadId, org_id: orgId, direction: "outbound",
      body: msgBody, twilio_sid: sendJson.message_sid ?? null,
      status: sendJson.status ?? "sent",
      cost_cents: sendJson.cost_estimate_usd ? Math.round(sendJson.cost_estimate_usd * 100 * 100) / 100 : null,
      drip_enrollment_id: drip_enrollment_id ?? null,
      sent_by: userId, sent_at: nowIso,
    })
    .select("id").single();
  if (mErr) console.error("sms_messages insert failed", mErr);

  // Lead activity
  if (lead_id) {
    await admin.from("lead_activities").insert({
      lead_id, org_id: orgId, actor_id: userId,
      activity_type: "sms_outbound",
      payload: { to, preview, message_sid: sendJson.message_sid, thread_id: threadId },
    });
  }

  return json({ ok: true, thread_id: threadId, message_id: msg?.id, message_sid: sendJson.message_sid });
});
