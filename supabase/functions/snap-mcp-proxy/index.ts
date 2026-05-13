// snap-mcp-proxy
// HMAC-SHA256 signed proxy for an external MCP server (Azure VM).
//
// Security model:
//   - Signature: HMAC-SHA256(SNAP_PROXY_SECRET, `${timestamp}.${rawBody}`)
//   - Headers:   X-SI-Timestamp (unix seconds), X-SI-Signature (lowercase hex)
//   - 300s clock-skew tolerance; older timestamps rejected
//   - 16 KB request body cap
//   - Constant-time signature compare (timingSafeEqualHex)
//   - SUPABASE_SERVICE_ROLE_KEY never leaves this function
//   - SNAP_PROXY_SECRET never returned in any response or log
//
// Address redaction:
//   - Bullet-mask approach: every digit run is replaced with "••••".
//     Guarantees NO street-number digits leak in the response (unit numbers,
//     PO Box numbers, ZIP+4 fragments, etc. are all neutralized in `address`).
//
// Caller contract for `lookup_property_by_address`:
//   - `address` SHOULD start with the street number (e.g. "123 Main St").
//     Query uses `address ILIKE '${address}%'` (prefix match). AI agent inputs
//     typically include the number. If Day-30 metrics show high false-negative
//     rate, relax to bidirectional wildcards (`%${address}%`).
//
// TODO (Day 5–6 backlog, BEFORE external pilot client onboarding):
//   - Implement token-bucket per-IP rate limit (~60 req/min/IP) keyed off
//     caller_ip. Persist counters in mcp_proxy_log or a dedicated KV table.
//     Auto-block IPs with repeated 401/HMAC failures.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";
import {
  classifyViolation,
  aggregatePropertyIntelligence,
  buildComponentBreakdown,
  type Violation as ScoringViolation,
} from "../_shared/enforcementScoring.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-si-timestamp, x-si-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BODY_BYTES = 16 * 1024;
const MAX_SKEW_SECONDS = 300;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(hex.substr(i * 2, 2), 16);
    if (Number.isNaN(byte)) return null;
    out[i] = byte;
  }
  return out;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const ab = hexToBytes(a.toLowerCase());
  const bb = hexToBytes(b.toLowerCase());
  if (!ab || !bb || ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Replace every run of digits with "••••". Strictly stronger than leading-token
// redaction — handles "PO Box 1234", "Apt 5B", trailing ZIPs, etc.
function redactAddress(addr: string): string {
  return addr.replace(/\d+/g, "••••");
}

function getCallerIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startedAt = Date.now();
  const callerIp = getCallerIp(req);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const PROXY_SECRET = Deno.env.get("SNAP_PROXY_SECRET");

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Telemetry helper — never logs request body, never logs the secret.
  const log = async (statusCode: number, success: boolean, opts: {
    operation?: string | null; error?: string | null; requestBytes?: number | null;
  } = {}) => {
    try {
      await admin.from("mcp_proxy_log").insert({
        operation: opts.operation ?? null,
        caller_ip: callerIp,
        status_code: statusCode,
        success,
        error: opts.error ?? null,
        duration_ms: Date.now() - startedAt,
        request_bytes: opts.requestBytes ?? null,
      });
    } catch (_e) { /* swallow logging errors */ }
  };

  if (req.method !== "POST") {
    await log(405, false, { error: "method_not_allowed" });
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  if (!PROXY_SECRET) {
    await log(500, false, { error: "secret_not_configured" });
    return jsonResponse(500, { error: "server_misconfigured" });
  }

  const tsHeader = req.headers.get("x-si-timestamp");
  const sigHeader = req.headers.get("x-si-signature");
  if (!tsHeader || !sigHeader) {
    await log(401, false, { error: "missing_signature_headers" });
    return jsonResponse(401, { error: "unauthorized" });
  }

  const tsNum = Number(tsHeader);
  if (!Number.isFinite(tsNum)) {
    await log(401, false, { error: "bad_timestamp" });
    return jsonResponse(401, { error: "unauthorized" });
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tsNum) > MAX_SKEW_SECONDS) {
    await log(401, false, { error: "timestamp_skew" });
    return jsonResponse(401, { error: "unauthorized" });
  }

  const rawBody = await req.text();
  const requestBytes = new TextEncoder().encode(rawBody).length;
  if (requestBytes > MAX_BODY_BYTES) {
    await log(413, false, { error: "body_too_large", requestBytes });
    return jsonResponse(413, { error: "payload_too_large" });
  }

  const expectedSig = await hmacSha256Hex(PROXY_SECRET, `${tsHeader}.${rawBody}`);
  if (!timingSafeEqualHex(expectedSig, sigHeader)) {
    await log(401, false, { error: "bad_signature", requestBytes });
    return jsonResponse(401, { error: "unauthorized" });
  }

  let payload: { operation?: string; params?: Record<string, unknown> };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    await log(400, false, { error: "invalid_json", requestBytes });
    return jsonResponse(400, { error: "invalid_json" });
  }

  const operation = payload?.operation;
  const params = payload?.params ?? {};

  // Keep-warm endpoint. HMAC already verified above. No DB read.
  if (operation === "ping") {
    await log(200, true, { operation, requestBytes });
    return jsonResponse(200, { ok: true });
  }

  if (operation === "auth_lookup") {
    const hash = typeof (params as any).api_key_hash === "string" ? (params as any).api_key_hash : "";
    if (!hash || !/^[a-f0-9]{64}$/.test(hash)) {
      await log(400, false, { operation, error: "invalid_hash_format", requestBytes });
      return jsonResponse(400, { error: "invalid_hash_format" });
    }

    const { data, error } = await admin
      .from("mcp_clients")
      .select("id, client_name, status, rate_limit_per_minute")
      .eq("api_key_hash", hash)
      .maybeSingle();

    if (error) {
      await log(500, false, { operation, error: error.message, requestBytes });
      return jsonResponse(500, { error: "lookup_failed" });
    }
    if (!data) {
      await log(200, true, { operation, requestBytes });
      return jsonResponse(200, { found: false });
    }
    if (data.status !== "active") {
      await log(200, true, { operation, requestBytes });
      return jsonResponse(200, { found: true, client_id: data.id, client_name: data.client_name, status: data.status });
    }

    // Update last_used_at fire-and-forget
    admin.from("mcp_clients").update({ last_used_at: new Date().toISOString() }).eq("id", data.id).then(() => {});

    await log(200, true, { operation, requestBytes });
    return jsonResponse(200, {
      found: true,
      client_id: data.id,
      client_name: data.client_name,
      status: "active",
      rate_limit_per_minute: data.rate_limit_per_minute,
    });
  }

  if (operation === "log_tool_call") {
    const p = params as any;
    if (!p.client_id || !p.tool_name || typeof p.response_status !== "number") {
      await log(400, false, { operation, error: "missing_fields", requestBytes });
      return jsonResponse(400, { error: "missing_fields" });
    }
    const { error } = await admin.from("mcp_tool_calls").insert({
      client_id: p.client_id,
      tool_name: p.tool_name,
      operation: p.operation_inner ?? null,
      caller_ip: p.caller_ip ?? null,
      request_bytes: p.request_bytes ?? null,
      response_status: p.response_status,
      duration_ms: p.duration_ms ?? null,
      success: !!p.success,
      error: p.error ?? null,
    });
    if (error) {
      await log(500, false, { operation, error: error.message, requestBytes });
      return jsonResponse(500, { error: "log_failed" });
    }
    await log(200, true, { operation, requestBytes });
    return jsonResponse(200, { logged: true });
  }

  if (operation === "lookup_property_by_address") {
    const address = typeof (params as any).address === "string" ? (params as any).address.trim() : "";
    const stateRaw = typeof (params as any).state === "string" ? (params as any).state.trim() : "";
    if (!address) {
      await log(400, false, { operation, error: "missing_address", requestBytes });
      return jsonResponse(400, { error: "missing_address" });
    }

    let state: string | null = null;
    if (stateRaw) {
      if (!/^[A-Za-z]{2}$/.test(stateRaw)) {
        await log(400, false, { operation, error: "invalid_state", requestBytes });
        return jsonResponse(400, { error: "invalid_state" });
      }
      state = stateRaw.toUpperCase();
    }

    const escaped = address.replace(/[\\%_]/g, (m) => `\\${m}`);
    let query = admin
      .from("properties")
      .select("address, city, state, snap_score, total_violations, newest_violation_date")
      .ilike("address", `${escaped}%`);

    // Supabase query builder methods return a NEW builder; must reassign.
    if (state) query = query.eq("state", state);

    const { data: rows, error } = await query.limit(5);

    if (error) {
      await log(500, false, { operation, error: error.message, requestBytes });
      return jsonResponse(500, { error: "query_failed" });
    }

    const confidence: "high" | "medium" | "none" =
      (rows?.length ?? 0) === 0 ? "none" : rows!.length === 1 ? "high" : "medium";

    const results = (rows ?? []).map((r) => ({
      address: redactAddress(r.address ?? ""),
      city: r.city,
      state: r.state,
      snap_score: r.snap_score,
      total_violations: r.total_violations,
      newest_violation_date: r.newest_violation_date,
    }));

    await log(200, true, { operation, requestBytes });
    return jsonResponse(200, { operation, confidence, count: results.length, results });
  }

  if (operation === "list_recent_violation_events") {
    const p = params as any;

    const state = typeof p.state === "string" ? p.state.toUpperCase() : null;
    if (!state || !/^[A-Z]{2}$/.test(state)) {
      await log(400, false, { operation, error: "invalid_state", requestBytes });
      return jsonResponse(400, { error: "invalid_state" });
    }

    const city = typeof p.city === "string" && p.city.length > 0 && p.city.length < 100 ? p.city : null;
    const county = typeof p.county === "string" && p.county.length > 0 && p.county.length < 100 ? p.county : null;

    const daysBackAllowed = [7, 14, 30, 60, 90];
    const daysBack = daysBackAllowed.includes(p.days_back) ? p.days_back : 30;

    let limit = Number.isInteger(p.limit) ? p.limit : 25;
    if (limit < 1) limit = 1;
    if (limit > 100) limit = 100;

    const { data, error } = await admin.rpc("list_recent_violation_events_v1", {
      p_state: state,
      p_city: city,
      p_county: county,
      p_days_back: daysBack,
      p_limit: limit,
    });

    if (error) {
      await log(500, false, { operation, error: error.message, requestBytes });
      return jsonResponse(500, { error: "query_failed" });
    }

    const REDACTED_ADDRESS = "•••• REDACTED";
    const results = (data ?? []).map((r: any) => ({
      property_id: r.property_id,
      address: REDACTED_ADDRESS,
      city: r.city,
      state: r.state,
      zip: r.zip,
      violation_count_recent: r.violation_count_recent,
      most_recent_violation_date: r.most_recent_violation_date,
      snapscore: r.snapscore,
    }));

    await log(200, true, { operation, requestBytes });
    return jsonResponse(200, {
      operation: "list_recent_violation_events",
      count: results.length,
      filters_applied: { state, city, county, days_back: daysBack, limit },
      results,
    });
  }

  if (operation === "get_enforcement_breakdown") {
    const propertyId = typeof (params as any).property_id === "string" ? (params as any).property_id.trim() : "";
    if (!UUID_RE.test(propertyId)) {
      await log(400, false, { operation, error: "invalid_property_id", requestBytes });
      return jsonResponse(400, { error: "invalid_property_id" });
    }

    const { data: property, error: propErr } = await admin
      .from("properties")
      .select("id, snap_score, escalated, last_analyzed_at")
      .eq("id", propertyId)
      .maybeSingle();

    if (propErr) {
      await log(500, false, { operation, error: propErr.message, requestBytes });
      return jsonResponse(500, { error: "query_failed" });
    }
    if (!property) {
      await log(404, false, { operation, error: "property_not_found", requestBytes });
      return jsonResponse(404, { error: "property_not_found" });
    }

    const { data: vRows, error: vErr } = await admin
      .from("violations")
      .select("id, violation_type, status, days_open, opened_date, raw_description, last_updated")
      .eq("property_id", propertyId);

    if (vErr) {
      await log(500, false, { operation, error: vErr.message, requestBytes });
      return jsonResponse(500, { error: "query_failed" });
    }

    const violations: ScoringViolation[] = (vRows ?? []) as ScoringViolation[];
    const classified = violations.map(classifyViolation);
    const intelligence = aggregatePropertyIntelligence(violations, classified, !!(property as any).escalated);
    const breakdown = buildComponentBreakdown(violations, classified, intelligence);

    const persisted = typeof property.snap_score === "number" ? property.snap_score : null;
    const recomputed = breakdown.final_score;
    const drift = persisted == null ? null : Math.abs(persisted - recomputed);
    let weightReconciliation: "exact" | "approximate" | "stale" | "unavailable" = "unavailable";
    if (drift !== null) {
      if (drift <= 5) weightReconciliation = "exact";
      else if (drift <= 15) weightReconciliation = "approximate";
      else weightReconciliation = "stale";
    }

    // Narrative from investor_insight_brief
    let narrative: string | null = null;
    const { data: briefRow } = await admin
      .from("investor_insight_brief")
      .select("brief_text")
      .eq("property_id", propertyId)
      .maybeSingle();
    if (briefRow && typeof (briefRow as any).brief_text === "string") {
      narrative = (briefRow as any).brief_text;
    }

    await log(200, true, { operation, requestBytes });
    return jsonResponse(200, {
      operation: "get_enforcement_breakdown",
      property_id: propertyId,
      scoring_version: breakdown.scoring_version,
      persisted_snap_score: persisted,
      recomputed_snap_score: recomputed,
      raw_sum_pre_cap: breakdown.raw_sum_pre_cap,
      resolved_cap_applied: breakdown.resolved_cap_applied,
      drift,
      weight_reconciliation: weightReconciliation,
      activity_class: breakdown.activity_class,
      signals: breakdown.signals,
      components: breakdown.components,
      narrative,
      last_analyzed_at: (property as any).last_analyzed_at ?? null,
    });
  }

  await log(400, false, { operation: operation ?? null, error: "unknown_operation", requestBytes });
  return jsonResponse(400, { error: "unknown_operation" });
});
