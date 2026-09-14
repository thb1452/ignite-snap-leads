// JD requires private customer access and paid tracing to remain held while
// the account/property authorization path is repaired and verified.
// Keep this path independent of provider SDKs and privileged database clients.
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Snap-Containment": "customer-unlock-held-20260914-v1",
};

Deno.serve((req: Request): Response => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  return new Response(JSON.stringify({
    success: false,
    error: "Property unlocking is temporarily unavailable while account access is verified.",
    code: "CUSTOMER_UNLOCK_HELD",
  }), { status: 503, headers });
});
