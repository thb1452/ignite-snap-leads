// Supabase Edge Function: integration-validate
//
// Part of the BYOA (Bring Your Own Accounts) system.
// Validates user-supplied third-party credentials (Twilio, skip-trace providers, etc.),
// stores them encrypted in Supabase Vault, and upserts a row in `user_integrations`.
//
// Flow:
//   1. Auth user via JWT
//   2. Resolve org_id from profiles
//   3. Test the credentials against the provider (live ping)
//   4. On success: vault.create_secret(plaintext) -> vault_secret_id
//   5. Upsert into user_integrations (org_id, service_name) with vault_secret_id + display metadata

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ServiceName = "twilio" | "batchdata" | "reisift";

interface ValidatePayload {
  service_name: ServiceName;
  credentials: Record<string, string>;
  daily_spend_cap_usd?: number;
}

async function validateTwilio(creds: Record<string, string>) {
  const { account_sid, auth_token, from_number } = creds;
  if (!account_sid || !auth_token || !from_number) {
    return { ok: false, error: "Missing account_sid, auth_token, or from_number" };
  }
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${account_sid}.json`, {
    headers: { Authorization: `Basic ${btoa(`${account_sid}:${auth_token}`)}` },
  });
  if (!res.ok) {
    return { ok: false, error: `Twilio auth failed (${res.status})` };
  }
  const data = await res.json();
  return {
    ok: true,
    display: { account_friendly_name: data.friendly_name, from_number, account_sid_masked: account_sid.slice(0, 6) + "…" + account_sid.slice(-4) },
  };
}

async function validateBatchData(creds: Record<string, string>) {
  const { api_key } = creds;
  if (!api_key) return { ok: false, error: "Missing api_key" };
  // BatchData has no public ping endpoint; do a cheap zero-result lookup
  const res = await fetch("https://api.batchdata.com/api/v1/property/skip-trace", {
    method: "POST",
    headers: { Authorization: `Bearer ${api_key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requests: [] }),
  });
  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: `BatchData auth failed (${res.status})` };
  }
  return { ok: true, display: { provider: "batchdata", key_masked: api_key.slice(0, 4) + "…" + api_key.slice(-4) } };
}

async function validateReiSift(creds: Record<string, string>) {
  const { api_key } = creds;
  if (!api_key) return { ok: false, error: "Missing api_key" };
  // Placeholder validation — replace with real REI Sift endpoint when available
  return { ok: true, display: { provider: "reisift", key_masked: api_key.slice(0, 4) + "…" + api_key.slice(-4) } };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const headers = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }
    const userId = authData.user.id;

    const { data: profile } = await admin.from("profiles").select("org_id").eq("user_id", userId).maybeSingle();
    if (!profile?.org_id) {
      return new Response(JSON.stringify({ error: "No org_id on profile" }), { status: 400, headers });
    }

    const body = (await req.json()) as ValidatePayload;
    if (!body?.service_name || !body?.credentials) {
      return new Response(JSON.stringify({ error: "service_name and credentials required" }), { status: 400, headers });
    }

    let validation: { ok: boolean; error?: string; display?: Record<string, unknown> };
    switch (body.service_name) {
      case "twilio": validation = await validateTwilio(body.credentials); break;
      case "batchdata": validation = await validateBatchData(body.credentials); break;
      case "reisift": validation = await validateReiSift(body.credentials); break;
      default:
        return new Response(JSON.stringify({ error: `Unsupported service: ${body.service_name}` }), { status: 400, headers });
    }

    if (!validation.ok) {
      return new Response(JSON.stringify({ ok: false, error: validation.error }), { status: 400, headers });
    }

    // ── Credential rotation flow ────────────────────────────────
    // 1. Look up any existing integration row (so we can clean up its old Vault secret later)
    // 2. Store the NEW plaintext in Vault → returns new vault_secret_id
    // 3. Upsert user_integrations with the new vault_secret_id
    // 4. ONLY after a successful upsert, delete the OLD Vault secret
    //    (if step 3 fails, the new secret stays so we don't leave the user with no working integration)

    const { data: existingIntegration } = await admin
      .from("user_integrations" as any)
      .select("vault_secret_id")
      .eq("org_id", profile.org_id)
      .eq("service_name", body.service_name)
      .maybeSingle();

    const oldVaultSecretId: string | null =
      (existingIntegration as any)?.vault_secret_id ?? null;

    // Store new plaintext in Vault
    const secretName = `byoa_${profile.org_id}_${body.service_name}_${Date.now()}`;
    const { data: vaultData, error: vaultErr } = await admin.rpc("vault_create_secret" as any, {
      secret: JSON.stringify(body.credentials),
      name: secretName,
    } as any);

    if (vaultErr || !vaultData) {
      console.error("[integration-validate] vault error:", vaultErr);
      return new Response(JSON.stringify({ error: "Vault storage failed", detail: vaultErr?.message }), { status: 500, headers });
    }

    const vaultSecretId = vaultData as string;

    // Upsert integration row with NEW vault_secret_id
    const { error: upsertErr } = await admin
      .from("user_integrations" as any)
      .upsert(
        {
          user_id: userId,
          org_id: profile.org_id,
          service_name: body.service_name,
          vault_secret_id: vaultSecretId,
          display_metadata: validation.display ?? {},
          status: "active",
          last_validated_at: new Date().toISOString(),
          validation_failure_count: 0,
          daily_spend_cap_usd: body.daily_spend_cap_usd ?? null,
        } as any,
        { onConflict: "org_id,service_name" } as any
      );

    if (upsertErr) {
      console.error("[integration-validate] upsert error:", upsertErr);
      // New Vault secret is orphaned but the OLD one is still valid for the existing integration.
      // We intentionally do NOT delete the new secret here — leave it for manual cleanup so we
      // never accidentally break a working integration on a transient DB error.
      return new Response(JSON.stringify({ error: "Failed to save integration", detail: upsertErr.message }), { status: 500, headers });
    }

    // Upsert succeeded — safe to delete the OLD Vault secret (if any)
    if (oldVaultSecretId && oldVaultSecretId !== vaultSecretId) {
      const { error: deleteErr } = await admin.rpc("vault_delete_secret" as any, {
        secret_id: oldVaultSecretId,
      } as any);
      if (deleteErr) {
        // Non-fatal: the integration is working with the new secret. Just log the orphan.
        console.warn(
          "[integration-validate] failed to delete old vault secret",
          oldVaultSecretId,
          deleteErr.message
        );
      }
    }

    return new Response(JSON.stringify({ ok: true, display: validation.display }), { headers });
  } catch (e: any) {
    console.error("[integration-validate] error:", e?.message ?? e);
    return new Response(JSON.stringify({ error: e?.message ?? "Internal error" }), { status: 500, headers });
  }
});
