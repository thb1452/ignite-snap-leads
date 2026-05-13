// seed_trigger — one-shot internal helper.
// Reads SNAP_PROXY_SECRET from env, signs an empty body, calls seed_mcp_client,
// returns its response. Will be deleted in A6 cleanup.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const proxySecret = Deno.env.get("SNAP_PROXY_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!proxySecret || !supabaseUrl || !anonKey) {
    return new Response(JSON.stringify({ error: "server_misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ts = Math.floor(Date.now() / 1000).toString();
  const body = "{}";
  const sig = await hmacSha256Hex(proxySecret, `${ts}.${body}`);

  const resp = await fetch(`${supabaseUrl}/functions/v1/seed_mcp_client`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-si-timestamp": ts,
      "x-si-signature": sig,
      "Authorization": `Bearer ${anonKey}`,
      "apikey": anonKey,
    },
    body,
  });

  const text = await resp.text();
  return new Response(text, {
    status: resp.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
