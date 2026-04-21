// integration-revalidate
// Cron-invoked daily health check for all active integrations.
// - Fetches each active row, decrypts credentials, pings provider's lightweight endpoint
// - On failure: increments validation_failure_count; after 3 strikes → status='disabled'
// - On success: resets failure count, updates last_validated_at
// - Internal-only: requires x-internal-secret header matching INTERNAL_FUNCTION_SECRET
//   OR a service-role JWT (cron uses anon, so we rely on the shared secret).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";
import { getSecret } from "../_shared/byoa/vault.ts";
import { fetchWithRetry } from "../_shared/byoa/fetchWithRetry.ts";
import { logAction } from "../_shared/byoa/actionLog.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FAILURE_THRESHOLD = 3;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const headers = { ...corsHeaders, "Content-Type": "application/json" };

  // Auth: x-internal-secret OR service-role-style header from cron
  const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  const provided = req.headers.get("x-internal-secret");
  if (!internalSecret || provided !== internalSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Pull all active integrations
  const { data: rows, error } = await admin
    .from("user_integrations")
    .select("id, org_id, service_name, vault_secret_id, validation_failure_count, status")
    .eq("status", "active");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
  }

  const results: Array<{ id: string; service: string; ok: boolean; failures: number; disabled?: boolean }> = [];

  for (const row of rows ?? []) {
    const r = row as any;
    let ok = false;
    let errMsg: string | null = null;

    try {
      const creds = await getSecret(admin, r.vault_secret_id);
      if (!creds) throw new Error("vault_secret_missing");

      switch (r.service_name) {
        case "twilio":
          ok = await pingTwilio(creds.account_sid, creds.auth_token);
          break;
        case "batchdata":
          ok = await pingBatchData(creds.api_key);
          break;
        case "reisift":
          ok = await pingReiSift(creds.api_key);
          break;
        default:
          errMsg = `unknown_service:${r.service_name}`;
      }
    } catch (e) {
      errMsg = e instanceof Error ? e.message : "ping_error";
    }

    const newFailures = ok ? 0 : (r.validation_failure_count ?? 0) + 1;
    const shouldDisable = newFailures >= FAILURE_THRESHOLD;

    await admin
      .from("user_integrations")
      .update({
        validation_failure_count: newFailures,
        last_validated_at: new Date().toISOString(),
        status: shouldDisable ? "disabled" : "active",
      } as any)
      .eq("id", r.id);

    await logAction(admin, {
      integrationId: r.id,
      userId: null as any, // system-initiated
      actionType: "integration.revalidate",
      success: ok,
      errorMessage: errMsg,
      requestMetadata: { service: r.service_name, failures: newFailures, disabled: shouldDisable },
    });

    results.push({
      id: r.id,
      service: r.service_name,
      ok,
      failures: newFailures,
      disabled: shouldDisable || undefined,
    });
  }

  return new Response(
    JSON.stringify({ checked: results.length, results }),
    { headers }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Lightweight provider pings
// ─────────────────────────────────────────────────────────────────────────────

async function pingTwilio(accountSid: string, authToken: string): Promise<boolean> {
  const auth = btoa(`${accountSid}:${authToken}`);
  const res = await fetchWithRetry(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
    { method: "GET", headers: { Authorization: `Basic ${auth}` } }
  );
  await res.text().catch(() => "");
  return res.ok;
}

async function pingBatchData(apiKey: string): Promise<boolean> {
  // Use account/balance endpoint as lightweight ping
  const res = await fetchWithRetry("https://api.batchdata.com/api/v1/account", {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  await res.text().catch(() => "");
  // Some providers return 404 for non-existent ping endpoints; treat 2xx + 401 separately
  return res.ok;
}

async function pingReiSift(apiKey: string): Promise<boolean> {
  const res = await fetchWithRetry("https://api.reisift.io/v1/account", {
    method: "GET",
    headers: { "X-API-Key": apiKey },
  });
  await res.text().catch(() => "");
  return res.ok;
}
