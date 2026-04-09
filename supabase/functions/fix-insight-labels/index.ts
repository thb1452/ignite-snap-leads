import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const BATCH = 500;
  let totalFixed = 0;
  const labelPattern = /\s*(PASS|HIGH OPPORTUNITY|GOOD OPPORTUNITY|WORTH A CALL|CALL NOW|OPPORTUNITY|WATCH|MONITOR)\.\s*$/;

  // Process up to 10 batches per invocation to stay within timeout
  for (let round = 0; round < 20; round++) {
    const { data: batch, error } = await supabase
      .from("properties")
      .select("id, snap_insight")
      .like("snap_insight", "%.")
      .limit(BATCH);

    if (error) {
      console.error("Select error:", error.message);
      break;
    }

    const toFix = (batch || []).filter((p: any) => labelPattern.test(p.snap_insight));
    if (toFix.length === 0) break;

    // Batch update using Promise.all with concurrency
    const updates = toFix.map((p: any) => {
      const fixed = p.snap_insight.replace(labelPattern, " $1");
      return supabase.from("properties").update({ snap_insight: fixed }).eq("id", p.id);
    });

    await Promise.all(updates);
    totalFixed += toFix.length;
    console.log(`Round ${round + 1}: fixed ${toFix.length} (total: ${totalFixed})`);
  }

  // Check remaining
  const { count } = await supabase
    .from("properties")
    .select("id", { count: "exact", head: true })
    .like("snap_insight", "%.");

  return new Response(JSON.stringify({ fixed: totalFixed, remaining_with_period: count }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
