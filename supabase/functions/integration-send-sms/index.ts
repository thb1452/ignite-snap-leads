// Supabase Edge Function: integration-send-sms
//
// Sends an SMS via the org's Twilio integration with TCPA compliance, idempotency,
// daily spend cap enforcement, and full action logging.
//
// Headers:
//   Authorization: Bearer <user_jwt>      (required)
//   Idempotency-Key: <client-supplied>    (optional, preferred over derived key)
//
// Body:
//   { to: "+15551234567", body: "...", property_id?: "uuid", recipient_zip?: "33101", recipient_state?: "FL" }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, getAuthContext, jsonResponse, loadActiveIntegration } from "../_shared/byoa/auth.ts";
import { fetchWithRetry } from "../_shared/byoa/fetchWithRetry.ts";
import { readVaultSecret } from "../_shared/byoa/vault.ts";
import { checkSmsCompliance } from "../_shared/byoa/compliance.ts";
import { resolveIdempotencyKey, findRecentDuplicate } from "../_shared/byoa/idempotency.ts";
import { logAction, checkSpendCap } from "../_shared/byoa/actionLog.ts";
import { sanitizeForLog, maskPhone } from "../_shared/byoa/sanitize.ts";

interface SendSmsPayload {
  to: string;
  body: string;
  property_id?: string | null;
  recipient_zip?: string | null;
  recipient_state?: string | null;
}

// Twilio outbound SMS cost — conservative US rate. Refine via Twilio Pricing API later.
const SMS_COST_USD = 0.0083;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await getAuthContext(req);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
  const { admin, userId, orgId } = auth.ctx;

  // Parse body
  let body: SendSmsPayload;
  try {
    body = (await req.json()) as SendSmsPayload;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  if (!body?.to || !body?.body) {
    return jsonResponse({ error: "to and body are required" }, 400);
  }
  if (body.body.length > 1600) {
    return jsonResponse({ error: "body exceeds 1600 char limit" }, 400);
  }

  // Load integration
  const integ = await loadActiveIntegration(admin, orgId, "twilio");
  if (!integ.ok) return jsonResponse({ error: integ.error }, integ.status);
  const integrationId = integ.row.id;

  // Idempotency check
  const headerKey = req.headers.get("idempotency-key");
  const idem = await resolveIdempotencyKey({
    integrationId,
    actionType: "sms.send",
    derivedFrom: { to: body.to, body: body.body, property_id: body.property_id ?? null },
    headerKey,
  });
  const dup = await findRecentDuplicate(admin, integrationId, "sms.send", idem.key, idem.windowMs);
  if (dup) {
    return jsonResponse(
      {
        ok: dup.success,
        idempotent_replay: true,
        original_log_id: dup.id,
        original_status: dup.response_status,
        idempotency_source: idem.source,
      },
      dup.success ? 200 : 409
    );
  }

  // Spend cap
  const cap = await checkSpendCap(admin, integrationId);
  if (!cap.ok) {
    await logAction(admin, {
      integrationId,
      userId,
      actionType: "sms.send",
      success: false,
      errorCode: "spend_cap_exceeded",
      errorMessage: `Daily spend cap reached: $${cap.usedUsd.toFixed(4)} / $${cap.capUsd.toFixed(2)}`,
      requestMetadata: { idempotency_key: idem.key, to: maskPhone(body.to) },
    });
    return jsonResponse(
      { error: "Daily spend cap exceeded", cap_usd: cap.capUsd, used_usd: cap.usedUsd },
      402
    );
  }

  // GLOBAL suppression check — cross-org TCPA enforcement
  // A number that opted out from any org is blocked everywhere.
  const { data: globalBlock } = await admin
    .from("global_sms_suppression" as any)
    .select("phone_number")
    .eq("phone_number", body.to)
    .maybeSingle();
  if (globalBlock) {
    await logAction(admin, {
      integrationId,
      userId,
      actionType: "sms.send",
      success: false,
      errorCode: "global_suppression",
      errorMessage: "Recipient is on global opt-out list",
      requestMetadata: { idempotency_key: idem.key, to: maskPhone(body.to) },
    });
    return jsonResponse({ error: "global_suppression", detail: "Recipient has opted out across all orgs" }, 403);
  }

  // Compliance gate (per-org suppression, quiet hours, blocked states)
  const compliance = await checkSmsCompliance(admin, {
    toPhoneE164: body.to,
    recipientZip: body.recipient_zip,
    recipientState: body.recipient_state,
    orgId,
  });
  if (!compliance.ok) {
    await logAction(admin, {
      integrationId,
      userId,
      actionType: "sms.send",
      success: false,
      errorCode: `compliance.${compliance.reason}`,
      errorMessage: JSON.stringify(compliance),
      requestMetadata: { idempotency_key: idem.key, to: maskPhone(body.to) },
    });
    return jsonResponse({ error: "compliance_block", detail: compliance }, 403);
  }

  // Decrypt Twilio creds from Vault
  let creds: Record<string, string>;
  try {
    creds = await readVaultSecret(admin, integ.row.vault_secret_id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[integration-send-sms] vault read failed:", msg);
    return jsonResponse({ error: "Failed to read credentials" }, 500);
  }
  const { account_sid, auth_token, from_number } = creds;
  if (!account_sid || !auth_token || !from_number) {
    return jsonResponse({ error: "Stored credentials are incomplete; please re-validate" }, 409);
  }

  // Send via Twilio
  const formBody = new URLSearchParams({ To: body.to, From: from_number, Body: body.body });
  let twilioRes: Response;
  try {
    twilioRes = await fetchWithRetry(
      `https://api.twilio.com/2010-04-01/Accounts/${account_sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${account_sid}:${auth_token}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formBody.toString(),
      }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logAction(admin, {
      integrationId,
      userId,
      actionType: "sms.send",
      success: false,
      errorCode: "network_error",
      errorMessage: msg,
      requestMetadata: { idempotency_key: idem.key, to: maskPhone(body.to) },
    });
    return jsonResponse({ error: "Twilio unreachable", detail: msg }, 502);
  }

  const twilioData = await twilioRes.json().catch(() => ({}));
  const success = twilioRes.ok;

  await logAction(admin, {
    integrationId,
    userId,
    actionType: "sms.send",
    success,
    responseStatus: twilioRes.status,
    errorCode: success ? null : String(twilioData?.code ?? "twilio_error"),
    errorMessage: success ? null : String(twilioData?.message ?? `HTTP ${twilioRes.status}`),
    costEstimateUsd: success ? SMS_COST_USD : null,
    requestMetadata: sanitizeForLog({
      idempotency_key: idem.key,
      idempotency_source: idem.source,
      to: maskPhone(body.to),
      property_id: body.property_id ?? null,
      message_sid: twilioData?.sid ?? null,
    }) as Record<string, unknown>,
  });

  if (!success) {
    return jsonResponse(
      { error: "Twilio send failed", code: twilioData?.code, message: twilioData?.message },
      twilioRes.status
    );
  }

  return jsonResponse({
    ok: true,
    message_sid: twilioData.sid,
    status: twilioData.status,
    cost_estimate_usd: SMS_COST_USD,
    idempotency_source: idem.source,
  });
});
