// Temporary signed invoker for seed_mcp_client. Deleted after use.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async () => {
  const secret = Deno.env.get("SNAP_PROXY_SECRET")!;
  const url = Deno.env.get("SUPABASE_URL")!;
  const ts = Math.floor(Date.now() / 1000).toString();
  const body = "{}";
  const sig = await hmacSha256Hex(secret, `${ts}.${body}`);
  const res = await fetch(`${url}/functions/v1/seed_mcp_client`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-si-timestamp": ts,
      "x-si-signature": sig,
    },
    body,
  });
  const text = await res.text();
  return new Response(text, { status: res.status, headers: { "content-type": "application/json" } });
});
