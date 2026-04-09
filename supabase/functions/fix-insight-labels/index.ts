import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const suffix = url.searchParams.get("suffix") || "PASS.";
  const cleanLabel = suffix.slice(0, -1);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let totalFixed = 0;

  for (let round = 0; round < 30; round++) {
    const { data: batch, error } = await supabase
      .from("properties")
      .select("id, snap_insight")
      .like("snap_insight", `%${suffix}`)
      .limit(200);

    if (error || !batch || batch.length === 0) break;

    const updates = batch.map((p: any) => {
      const fixed = p.snap_insight.replace(
        new RegExp(`\\s*${suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`),
        ` ${cleanLabel}`
      );
      return supabase.from("properties").update({ snap_insight: fixed }).eq("id", p.id);
    });

    await Promise.all(updates);
    totalFixed += batch.length;
    console.log(`Round ${round + 1}: fixed ${batch.length} (total: ${totalFixed})`);
  }

  // Count remaining
  const { count } = await supabase
    .from("properties")
    .select("id", { count: "exact", head: true })
    .like("snap_insight", `%${suffix}`);

  return new Response(JSON.stringify({ suffix, fixed: totalFixed, remaining: count }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
