// Supabase Edge Function: integration-validate
//
// Validates user-supplied third-party credentials, stores them encrypted in Vault,
// and upserts user_integrations. Implements credential rotation: new secret stored
// and integration row updated FIRST; old Vault secret deleted only after success.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, getAuthContext, jsonResponse } from "../_shared/byoa/auth.ts";
import { fetchWithRetry } from "../_shared/byoa/fetchWithRetry.ts";
import { createVaultSecret, deleteVaultSecret } from "../_shared/byoa/vault.ts";
import { logAction } from "../_shared/byoa/actionLog.ts";
import { sanitizeForLog } from "../_shared/byoa/sanitize.ts";

type ServiceName = "twilio" | "batchdata" | "reisift";

interface ValidatePayload {
  service_name: ServiceName;
  credentials: Record<string, string>;
  daily_spend_cap_usd?: number;
}

type ValidationResult =
  | { ok: true; display: Record<string, unknown> }
  | { ok: false; error: string; status?: number };

async function validateTwilio(creds: Record<string, string>): Promise<ValidationResult> {
  const { account_sid, auth_token, from_number } = creds;
  if (!account_sid || !auth_token || !from_number) {
    return { ok: false, error: "Missing account_sid, auth_token, or from_number" };
  }
  if (!/^\+\d{10,15}$/.test(from_number)) {
    return { ok: false, error: "from_number must be E.164 format (e.g. +15551234567)" };
  }
  const res = await fetchWithRetry(
    `https://api.twilio.com/2010-04-01/Accounts/${account_sid}.json`,
    { headers: { Authorization: `Basic ${btoa(`${account_sid}:${auth_token}`)}` } }
  );
  if (!res.ok) {
    return { ok: false, error: `Twilio auth failed (${res.status})`, status: res.status };
  }
  const data = await res.json();
  return {
    ok: true,
    display: {
      account_friendly_name: data.friendly_name,
      from_number,
      account_sid_masked: `${account_sid.slice(0, 6)}…${account_sid.slice(-4)}`,
    },
  };
}

async function validateBatchData(creds: Record<string, string>): Promise<ValidationResult> {
  const { api_key } = creds;
  if (!api_key) return { ok: false, error: "Missing api_key" };
  const res = await fetchWithRetry("https://api.batchdata.com/api/v1/property/skip-trace", {
    method: "POST",
    headers: { Authorization: `Bearer ${api_key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requests: [] }),
  });
  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: `BatchData auth failed (${res.status})`, status: res.status };
  }
  return {
    ok: true,
    display: { provider: "batchdata", key_masked: `${api_key.slice(0, 4)}…${api_key.slice(-4)}` },
  };
}

async function validateReiSift(creds: Record<string, string>): Promise<ValidationResult> {
  const { api_key } = creds;
  if (!api_key) return { ok: false, error: "Missing api_key" };
  return {
    ok: true,
    display: { provider: "reisift", key_masked: `${api_key.slice(0, 4)}…${api_key.slice(-4)}` },
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await getAuthContext(req);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
  const { admin, userId, orgId } = auth.ctx;

  let body: ValidatePayload;
  try {
    body = (await req.json()) as ValidatePayload;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  if (!body?.service_name || !body?.credentials) {
    return jsonResponse({ error: "service_name and credentials required" }, 400);
  }

  let validation: ValidationResult;
  try {
    switch (body.service_name) {
      case "twilio":   validation = await validateTwilio(body.credentials); break;
      case "batchdata": validation = await validateBatchData(body.credentials); break;
      case "reisift":   validation = await validateReiSift(body.credentials); break;
      default:
        return jsonResponse({ error: `Unsupported service: ${body.service_name}` }, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Validation request failed";
    console.error("[integration-validate] provider error:", msg);
    return jsonResponse({ error: `Provider unreachable: ${msg}` }, 502);
  }

  if (!validation.ok) {
    return jsonResponse({ ok: false, error: validation.error }, validation.status ?? 400);
  }

  // Look up existing integration so we can clean up its old Vault secret on success
  const { data: existing } = await admin
    .from("user_integrations" as any)
    .select("id, vault_secret_id")
    .eq("org_id", orgId)
    .eq("service_name", body.service_name)
    .maybeSingle();
  const oldVaultSecretId: string | null = (existing as any)?.vault_secret_id ?? null;

  // Store new credentials in Vault
  let newVaultSecretId: string;
  try {
    newVaultSecretId = await createVaultSecret(
      admin,
      JSON.stringify(body.credentials),
      `byoa_${orgId}_${body.service_name}_${Date.now()}`
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[integration-validate]", sanitizeForLog({ vault_error: msg }));
    return jsonResponse({ error: "Vault storage failed" }, 500);
  }

  // Upsert integration row with NEW vault_secret_id
  const { data: upserted, error: upsertErr } = await admin
    .from("user_integrations" as any)
    .upsert(
      {
        user_id: userId,
        org_id: orgId,
        service_name: body.service_name,
        vault_secret_id: newVaultSecretId,
        display_metadata: validation.display,
        status: "active",
        last_validated_at: new Date().toISOString(),
        validation_failure_count: 0,
        daily_spend_cap_usd: body.daily_spend_cap_usd ?? null,
      } as any,
      { onConflict: "org_id,service_name" } as any
    )
    .select("id")
    .single();

  if (upsertErr || !upserted) {
    console.error("[integration-validate] upsert error:", upsertErr?.message);
    // Leave the new Vault secret orphaned rather than risk breaking the existing integration.
    return jsonResponse({ error: "Failed to save integration" }, 500);
  }

  // Upsert succeeded — safe to delete OLD Vault secret
  if (oldVaultSecretId && oldVaultSecretId !== newVaultSecretId) {
    try {
      await deleteVaultSecret(admin, oldVaultSecretId);
    } catch (e) {
      console.warn(
        "[integration-validate] old vault secret cleanup failed (non-fatal):",
        oldVaultSecretId,
        e instanceof Error ? e.message : e
      );
    }
  }

  await logAction(admin, {
    integrationId: (upserted as any).id,
    userId,
    actionType: "integration.validate",
    success: true,
    responseStatus: 200,
    requestMetadata: { service_name: body.service_name, rotated: !!oldVaultSecretId },
  });

  return jsonResponse({ ok: true, display: validation.display });
});
