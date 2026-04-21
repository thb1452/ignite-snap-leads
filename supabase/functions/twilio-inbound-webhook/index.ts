// twilio-inbound-webhook
// Public Twilio webhook endpoint (verify_jwt=false).
// Receives inbound SMS, matches/creates thread by (org, from_number=our#, to_number=sender#),
// pauses any active drip enrollments for matched lead, handles STOP/HELP keywords.
//
// Security: validates X-Twilio-Signature HMAC against the org's auth_token from vault.
// Twilio posts application/x-www-form-urlencoded with fields:
//   From, To, Body, MessageSid, AccountSid, etc.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";
import { readVaultSecret } from "../_shared/byoa/vault.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

const STOP_KEYWORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const HELP_KEYWORDS = new Set(["HELP", "INFO"]);

function twiml(message?: string) {
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response/>`;
  return new Response(body, {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/xml" },
  });
}

// Twilio signature validation: HMAC-SHA1 of (full URL + sorted form params concatenated)
// using the auth_token as key, compared base64-encoded.
async function validateTwilioSignature(
  authToken: string,
  url: string,
  params: URLSearchParams,
  signature: string,
): Promise<boolean> {
  // Build canonical string: URL + sorted (key+value) pairs concatenated
  const sortedKeys = Array.from(new Set(Array.from(params.keys()))).sort();
  let data = url;
  for (const k of sortedKeys) {
    data += k + (params.get(k) ?? "");
  }
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  // base64 encode
  const bytes = new Uint8Array(sig);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const expected = btoa(bin);
  return expected === signature;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Read body once, then parse
  const rawBody = await req.text().catch(() => "");
  let formData: URLSearchParams;
  try {
    formData = new URLSearchParams(rawBody);
  } catch {
    return twiml();
  }

  const fromSender = formData.get("From") ?? "";  // sender's phone (recipient of our outbound)
  const toUs = formData.get("To") ?? "";          // our Twilio number
  const msgBody = formData.get("Body") ?? "";
  const messageSid = formData.get("MessageSid") ?? null;
  const signature = req.headers.get("x-twilio-signature") ?? "";

  if (!fromSender || !toUs) return twiml();

  // Find org by matching the user_integrations row whose vault display_metadata.from_number = toUs
  const { data: integRow } = await admin
    .from("user_integrations")
    .select("id, org_id, display_metadata, vault_secret_id")
    .eq("service_name", "twilio")
    .eq("status", "active")
    .filter("display_metadata->>from_number", "eq", toUs)
    .maybeSingle();

  if (!integRow?.org_id) {
    console.warn("No org found for inbound to", toUs);
    return twiml();
  }
  const orgId = integRow.org_id as string;

  // ── Validate Twilio signature against this org's auth_token ───────────────
  // Skip validation only if explicitly disabled via env (for local debugging).
  const SKIP_VERIFY = Deno.env.get("TWILIO_SKIP_SIGNATURE_VERIFY") === "true";
  if (!SKIP_VERIFY) {
    if (!signature) {
      console.warn("Missing X-Twilio-Signature header");
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }
    let authToken: string | null = null;
    try {
      const creds = await readVaultSecret(admin, (integRow as any).vault_secret_id);
      authToken = creds?.auth_token ?? null;
    } catch (e) {
      console.error("vault read failed for inbound webhook", e);
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }
    if (!authToken) {
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }
    // Twilio signs the full request URL it called. Reconstruct from incoming req.
    const url = req.url;
    const valid = await validateTwilioSignature(authToken, url, formData, signature);
    if (!valid) {
      console.warn("Invalid Twilio signature for org", orgId);
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  // Find existing thread (our number = from_number, sender = to_number)
  const { data: thread } = await admin
    .from("sms_threads")
    .select("id, lead_id, unread_count")
    .eq("org_id", orgId).eq("from_number", toUs).eq("to_number", fromSender)
    .maybeSingle();

  let threadId = thread?.id as string | undefined;
  let leadId = thread?.lead_id as string | null | undefined;

  if (!threadId) {
    const { data: newThread } = await admin
      .from("sms_threads")
      .insert({
        org_id: orgId, from_number: toUs, to_number: fromSender,
        status: "active", last_inbound_at: new Date().toISOString(),
        last_message_preview: msgBody.slice(0, 140), unread_count: 1,
      })
      .select("id, lead_id").single();
    threadId = newThread?.id;
    leadId = newThread?.lead_id ?? null;
  } else {
    await admin.from("sms_threads").update({
      last_inbound_at: new Date().toISOString(),
      last_message_preview: msgBody.slice(0, 140),
      unread_count: ((thread as any).unread_count ?? 0) + 1,
    }).eq("id", threadId);
  }

  // Insert inbound message
  await admin.from("sms_messages").insert({
    thread_id: threadId, org_id: orgId, direction: "inbound",
    body: msgBody, twilio_sid: messageSid, status: "received",
    sent_at: new Date().toISOString(),
  });

  // Pause active drip enrollments for the lead (if any) — opted-out or replied
  if (leadId) {
    await admin.from("drip_enrollments")
      .update({ status: "paused", pause_reason: "lead_replied" })
      .eq("lead_id", leadId).eq("status", "active");

    await admin.from("lead_activities").insert({
      lead_id: leadId, org_id: orgId, actor_id: null,
      activity_type: "sms_inbound",
      payload: { from: fromSender, preview: msgBody.slice(0, 140), thread_id: threadId, message_sid: messageSid },
    });
  }

  // STOP / HELP keyword handling
  const upper = msgBody.trim().toUpperCase();
  if (STOP_KEYWORDS.has(upper)) {
    await admin.from("suppression_list" as any).insert({
      org_id: orgId, phone: fromSender, reason: "STOP keyword",
    }).then(() => {}).catch(() => {});
    await admin.from("drip_enrollments")
      .update({ status: "paused", pause_reason: "opted_out" })
      .eq("org_id", orgId).eq("to_number", fromSender).eq("status", "active");
    return twiml("You have been unsubscribed. Reply START to opt back in.");
  }
  if (HELP_KEYWORDS.has(upper)) {
    return twiml("Reply STOP to unsubscribe. Msg & data rates may apply.");
  }

  return twiml();
});
