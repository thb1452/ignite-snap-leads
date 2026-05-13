// snap-mcp-keepwarm
// Vault-free keep-warm pinger for snap-mcp-proxy.
//
// Architecture:
//   pg_cron (every 4 min) -> net.http_post (plain, no signing) -> THIS FUNCTION
//     -> reads SNAP_PROXY_SECRET from Deno.env -> signs HMAC -> POSTs {operation:"ping"}
//        to snap-mcp-proxy
//
// Single source of truth for SNAP_PROXY_SECRET: edge function env. No vault entries.
// Rotation = update env value in one place.

import { createHmac } from "node:crypto";

const SNAP_PROXY_URL = "https://ojyxblegxpdgaqiscxpz.supabase.co/functions/v1/snap-mcp-proxy";

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const secret = Deno.env.get("SNAP_PROXY_SECRET");
  if (!secret) {
    return new Response(JSON.stringify({ error: "missing_secret" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = JSON.stringify({ operation: "ping" });
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");

  const startedAt = Date.now();
  let proxyStatus = 0;
  let proxyError: string | null = null;

  try {
    const r = await fetch(SNAP_PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SI-Timestamp": ts,
        "X-SI-Signature": sig,
      },
      body,
    });
    proxyStatus = r.status;
    if (r.status !== 200) {
      const text = await r.text();
      proxyError = text.slice(0, 200);
    }
  } catch (err) {
    proxyError = String(err).slice(0, 200);
  }

  const duration_ms = Date.now() - startedAt;
  const ok = proxyStatus === 200;

  return new Response(
    JSON.stringify({
      ok,
      proxy_status: proxyStatus,
      duration_ms,
      error: proxyError,
      timestamp: new Date().toISOString(),
    }),
    {
      status: ok ? 200 : 500,
      headers: { "Content-Type": "application/json" },
    },
  );
});
