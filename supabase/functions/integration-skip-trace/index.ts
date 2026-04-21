// integration-skip-trace
// Skip-trace a property's owner via the user's BYOA provider (BatchData / ReiSift).
// UPSERTs into owners on (property_id, source).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";
import { getAuthContext, loadActiveIntegration } from "../_shared/byoa/auth.ts";
import { readVaultSecret } from "../_shared/byoa/vault.ts";
import { fetchWithRetry } from "../_shared/byoa/fetchWithRetry.ts";
import { logAction, checkSpendCap } from "../_shared/byoa/actionLog.ts";
import { resolveIdempotencyKey, findRecentDuplicate } from "../_shared/byoa/idempotency.ts";
import { sanitizeForLog } from "../_shared/byoa/sanitize.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, idempotency-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Cost defaults per provider (USD per successful lookup)
const COST_PER_LOOKUP: Record<string, number> = {
  batchdata: 0.15,
  reisift: 0.20,
};

interface SkipTraceRequest {
  property_id: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const headers = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1. Auth
    const authResult = await getAuthContext(req);
    if (!authResult.ok) {
      return new Response(JSON.stringify({ error: authResult.error }), { status: authResult.status, headers });
    }
    const { userId, orgId } = authResult.ctx;

    // 2. Body
    const body = (await req.json().catch(() => ({}))) as SkipTraceRequest;
    if (!body.property_id || typeof body.property_id !== "string") {
      return new Response(JSON.stringify({ error: "property_id required" }), { status: 400, headers });
    }

    // 3. Load active skip-trace integration (try batchdata first, then reisift)
    let integrationLoad = await loadActiveIntegration(admin, orgId, "batchdata");
    if (!integrationLoad.ok) {
      integrationLoad = await loadActiveIntegration(admin, orgId, "reisift");
    }
    if (!integrationLoad.ok) {
      return new Response(
        JSON.stringify({ error: "No active skip-trace integration (batchdata or reisift)" }),
        { status: 412, headers }
      );
    }
    const integration = integrationLoad.row;
    // service_name isn't returned by loadActiveIntegration; re-fetch it.
    const { data: svcRow } = await admin
      .from("user_integrations" as any)
      .select("service_name")
      .eq("id", integration.id)
      .maybeSingle();
    const provider = ((svcRow as any)?.service_name ?? "batchdata") as "batchdata" | "reisift";

    // 4. Spend cap
    const cap = await checkSpendCap(admin, integration.id);
    if (!cap.ok) {
      await logAction(admin, {
        integrationId: integration.id,
        userId,
        actionType: "skiptrace.lookup",
        success: false,
        errorCode: "spend_cap_exceeded",
        errorMessage: `Daily cap $${cap.capUsd} reached ($${cap.usedUsd} used)`,
        requestMetadata: { property_id: body.property_id },
      });
      return new Response(
        JSON.stringify({ error: "Daily spend cap exceeded", cap_usd: cap.capUsd, used_usd: cap.usedUsd }),
        { status: 429, headers }
      );
    }

    // 5. Idempotency (header preferred → derived 60s window)
    const headerKey = req.headers.get("idempotency-key");
    const idem = await resolveIdempotencyKey({
      integrationId: integration.id,
      actionType: "skiptrace.lookup",
      derivedFrom: { property_id: body.property_id },
      headerKey,
    });
    const dup = await findRecentDuplicate(
      admin,
      integration.id,
      "skiptrace.lookup",
      idem.key,
      idem.windowMs
    );
    if (dup) {
      return new Response(
        JSON.stringify({
          replayed: true,
          idempotency_key: idem.key,
          original_log_id: dup.id,
          original_at: dup.created_at,
          original_success: dup.success,
        }),
        { headers }
      );
    }

    // 6. Load property address
    const { data: property, error: propErr } = await admin
      .from("properties")
      .select("id, address, city, state, zip")
      .eq("id", body.property_id)
      .maybeSingle();
    if (propErr || !property) {
      return new Response(JSON.stringify({ error: "Property not found" }), { status: 404, headers });
    }

    // 7. Fetch credentials
    let creds: Record<string, string>;
    try {
      creds = await readVaultSecret(admin, integration.vault_secret_id);
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "Credentials unavailable", detail: e instanceof Error ? e.message : "vault_error" }),
        { status: 500, headers }
      );
    }

    // 8. Provider call
    let providerResult: {
      ok: boolean;
      status: number;
      name?: string | null;
      phones: string[];
      emails: string[];
      mailing_address?: string | null;
      confidence?: string | null;
      raw?: unknown;
      errorCode?: string;
      errorMessage?: string;
    };

    try {
      if (provider === "batchdata") {
        providerResult = await callBatchData(creds.api_key, property);
      } else {
        providerResult = await callReiSift(creds.api_key, property);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "provider_error";
      await logAction(admin, {
        integrationId: integration.id,
        userId,
        actionType: "skiptrace.lookup",
        success: false,
        errorCode: "provider_exception",
        errorMessage: msg,
        requestMetadata: { property_id: body.property_id, provider },
      });
      return new Response(JSON.stringify({ error: "Provider call failed", detail: msg }), { status: 502, headers });
    }

    if (!providerResult.ok) {
      await logAction(admin, {
        integrationId: integration.id,
        userId,
        actionType: "skiptrace.lookup",
        success: false,
        responseStatus: providerResult.status,
        errorCode: providerResult.errorCode ?? "provider_error",
        errorMessage: providerResult.errorMessage ?? null,
        requestMetadata: { property_id: body.property_id, provider },
      });
      return new Response(
        JSON.stringify({ error: providerResult.errorMessage ?? "Provider error", status: providerResult.status }),
        { status: 502, headers }
      );
    }

    // 9. UPSERT into owners on (property_id, source) — overwrite on re-run
    const { error: upsertErr } = await admin
      .from("owners")
      .upsert(
        {
          property_id: property.id,
          org_id: orgId,
          source: provider,
          name: providerResult.name ?? null,
          phones: providerResult.phones,
          emails: providerResult.emails,
          mailing_address: providerResult.mailing_address ?? null,
          confidence: providerResult.confidence ?? null,
          raw_payload: sanitizeForLog(providerResult.raw ?? {}),
          created_by: userId,
          updated_at: new Date().toISOString(),
        } as any,
        { onConflict: "property_id,source" }
      );

    if (upsertErr) {
      await logAction(admin, {
        integrationId: integration.id,
        userId,
        actionType: "skiptrace.lookup",
        success: false,
        errorCode: "db_upsert_failed",
        errorMessage: upsertErr.message,
        requestMetadata: { property_id: body.property_id, provider },
      });
      return new Response(JSON.stringify({ error: "Failed to save owner", detail: upsertErr.message }), {
        status: 500,
        headers,
      });
    }

    // 10. Cost tracking + log
    const cost = providerResult.phones.length > 0 || providerResult.emails.length > 0
      ? COST_PER_LOOKUP[provider] ?? 0
      : 0; // No-hit lookups don't bill

    await logAction(admin, {
      integrationId: integration.id,
      userId,
      actionType: "skiptrace.lookup",
      success: true,
      responseStatus: providerResult.status,
      costEstimateUsd: cost,
      requestMetadata: {
        idempotency_key: idem.key,
        idempotency_source: idem.source,
        property_id: body.property_id,
        provider,
        hit: cost > 0,
        phones_count: providerResult.phones.length,
        emails_count: providerResult.emails.length,
      },
    });

    const responseBody = {
      success: true,
      provider,
      property_id: property.id,
      name: providerResult.name,
      phones: providerResult.phones,
      emails: providerResult.emails,
      mailing_address: providerResult.mailing_address,
      confidence: providerResult.confidence,
      cost_usd: cost,
      idempotency_key: idem.key,
    };

    return new Response(JSON.stringify(responseBody), { headers });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    console.error("[integration-skip-trace] fatal:", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Provider adapters
// ─────────────────────────────────────────────────────────────────────────────

async function callBatchData(
  apiKey: string,
  property: { address: string; city: string; state: string; zip: string }
) {
  const res = await fetchWithRetry("https://api.batchdata.com/api/v1/property/skip-trace", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [
        {
          propertyAddress: {
            street: property.address,
            city: property.city,
            state: property.state,
            zip: property.zip,
          },
        },
      ],
    }),
  });

  const status = res.status;
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return {
      ok: false as const,
      status,
      phones: [],
      emails: [],
      errorCode: `http_${status}`,
      errorMessage: txt.slice(0, 200),
    };
  }

  const json = await res.json();
  const persons =
    json?.results?.persons || json?.results?.[0]?.persons || [];
  const top = persons[0];

  const phones: string[] = [];
  const emails: string[] = [];
  let name: string | null = null;
  let mailing: string | null = null;
  let confidence: string | null = null;

  if (top) {
    const ph = top.phones || top.phoneNumbers || [];
    for (const p of ph) {
      const n = p.phone || p.number;
      if (n) phones.push(String(n));
    }
    const em = top.emails || top.emailAddresses || [];
    for (const e of em) {
      const n = e.email || e.address;
      if (n) emails.push(String(n));
    }
    const first = top.firstName || top.name?.first;
    const last = top.lastName || top.name?.last;
    name = [first, last].filter(Boolean).join(" ") || (typeof top.name === "string" ? top.name : null);
    const m = top.addresses?.[0];
    if (m) mailing = [m.street, m.city, m.state, m.zip].filter(Boolean).join(", ");
    confidence = top.confidence ?? top.matchScore ?? null;
  }

  return {
    ok: true as const,
    status,
    name,
    phones: dedupe(phones),
    emails: dedupe(emails),
    mailing_address: mailing,
    confidence,
    raw: json,
  };
}

async function callReiSift(
  apiKey: string,
  property: { address: string; city: string; state: string; zip: string }
) {
  const res = await fetchWithRetry("https://api.reisift.io/v1/skip-trace", {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      address: property.address,
      city: property.city,
      state: property.state,
      zip: property.zip,
    }),
  });

  const status = res.status;
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return {
      ok: false as const,
      status,
      phones: [],
      emails: [],
      errorCode: `http_${status}`,
      errorMessage: txt.slice(0, 200),
    };
  }

  const json = await res.json();
  const owner = json?.owner || json?.data?.owner || json?.data || {};
  const phones: string[] = (owner.phones || owner.phone_numbers || [])
    .map((p: any) => p?.number || p?.phone || (typeof p === "string" ? p : null))
    .filter(Boolean);
  const emails: string[] = (owner.emails || owner.email_addresses || [])
    .map((e: any) => e?.address || e?.email || (typeof e === "string" ? e : null))
    .filter(Boolean);

  const name =
    [owner.first_name, owner.last_name].filter(Boolean).join(" ") ||
    owner.name ||
    null;
  const mailing = owner.mailing_address
    ? typeof owner.mailing_address === "string"
      ? owner.mailing_address
      : [
          owner.mailing_address.street,
          owner.mailing_address.city,
          owner.mailing_address.state,
          owner.mailing_address.zip,
        ]
          .filter(Boolean)
          .join(", ")
    : null;

  return {
    ok: true as const,
    status,
    name,
    phones: dedupe(phones),
    emails: dedupe(emails),
    mailing_address: mailing,
    confidence: owner.confidence ?? null,
    raw: json,
  };
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr.map((x) => x.trim()).filter(Boolean)));
}
