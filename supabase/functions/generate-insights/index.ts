// Emergency containment approved by JD on 2026-09-09.
// Resume only after caller authorization has been verified.
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Snap-Containment": "insights-paused-20260909-v1",
};
Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  return new Response(JSON.stringify({ error: "Insight generation is temporarily unavailable." }), {
    status: 503,
    headers: { ...headers, "Retry-After": "3600" },
  });
});
