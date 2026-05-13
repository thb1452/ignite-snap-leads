// Temporary smoke-test caller for snap-mcp-proxy. Signs HMAC and forwards.
// Delete after Step 3D verification.
import { createHmac } from "node:crypto";

const PROXY_URL = "https://ojyxblegxpdgaqiscxpz.supabase.co/functions/v1/snap-mcp-proxy";

Deno.serve(async (req) => {
  const secret = Deno.env.get("SNAP_PROXY_SECRET");
  if (!secret) return new Response(JSON.stringify({ error: "missing_secret" }), { status: 500 });

  const inner = await req.text();
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = createHmac("sha256", secret).update(`${ts}.${inner}`).digest("hex");

  const r = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-SI-Timestamp": ts, "X-SI-Signature": sig },
    body: inner,
  });
  const text = await r.text();
  return new Response(text, { status: r.status, headers: { "Content-Type": "application/json" } });
});
