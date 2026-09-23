import { insightOperatorDenial, insightsHeldResponse } from "../_shared/insightOperatorAuth.ts";

// Original provider implementation remains in Git history. No legacy property,
// contact or raw violation text can reach a provider through this endpoint.
// Checked received records get their cited private insight in the receipt import.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  const denial = await insightOperatorDenial(req, corsHeaders);
  return denial ?? insightsHeldResponse(corsHeaders);
});
