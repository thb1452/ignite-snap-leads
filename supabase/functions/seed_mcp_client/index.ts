// seed_mcp_client
// One-shot seeding helper for mcp_clients rows.
//
// Reads CLIENT_NAME and CLIENT_RAW_KEY from env (set via Add Secret form).
// Validates CLIENT_RAW_KEY against /^snip_[a-f0-9]{64}$/.
// SHA-256 hashes the full string, takes first 8 chars as api_key_prefix,
// inserts into mcp_clients.
//
// HMAC-SHA256 signed with SNAP_PROXY_SECRET (same pattern as snap-mcp-proxy).
// Never returns the raw key or hash in any response or log.

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

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });

  const proxySecret = Deno.env.get("SNAP_PROXY_SECRET");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!proxySecret || !serviceRoleKey || !supabaseUrl) {
    return jsonResponse(500, { error: "server_misconfigured" });
  }

  // HMAC verification (same contract as snap-mcp-proxy)
  const ts = req.headers.get("x-si-timestamp");
  const sig = req.headers.get("x-si-signature");
  if (!ts || !sig) return jsonResponse(401, { error: "missing_signature" });
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return jsonResponse(401, { error: "bad_timestamp" });
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tsNum) > MAX_SKEW_SECONDS) return jsonResponse(401, { error: "stale_timestamp" });

  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) return jsonResponse(413, { error: "body_too_large" });
  const expected = await hmacSha256Hex(proxySecret, `${ts}.${rawBody}`);
  if (!timingSafeEqualHex(expected, sig)) return jsonResponse(401, { error: "bad_signature" });

  // Pull seed inputs from env (Add Secret transport)
  const clientName = Deno.env.get("CLIENT_NAME");
  const rawKey = Deno.env.get("CLIENT_RAW_KEY");
  if (!clientName || !rawKey) return jsonResponse(400, { error: "missing_env_inputs" });

  if (!/^(snip_)?[a-f0-9]{64}$/.test(rawKey)) {
    return jsonResponse(400, { error: "invalid_raw_key_format" });
  }

  const apiKeyHash = await sha256Hex(rawKey);
  const apiKeyPrefix = rawKey.slice(0, 8);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("mcp_clients")
    .insert({
      client_name: clientName,
      api_key_hash: apiKeyHash,
      api_key_prefix: apiKeyPrefix,
      status: "active",
      notes: "Day 2 seed via Option A flow",
    })
    .select("id, api_key_prefix")
    .single();

  if (error) {
    return jsonResponse(500, { error: "insert_failed", code: error.code });
  }

  return jsonResponse(200, {
    ok: true,
    client_id: data.id,
    api_key_prefix: data.api_key_prefix,
  });
});
