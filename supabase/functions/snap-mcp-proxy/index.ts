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

  await log(400, false, { operation: operation ?? null, error: "unknown_operation", requestBytes });
  return jsonResponse(400, { error: "unknown_operation" });
});
