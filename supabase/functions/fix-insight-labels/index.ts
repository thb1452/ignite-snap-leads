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

  const BATCH = 2000;
  let totalFixed = 0;

  // Fix trailing periods on action labels
  const labelPattern = /\s*(PASS|HIGH OPPORTUNITY|GOOD OPPORTUNITY|WORTH A CALL|CALL NOW|OPPORTUNITY|WATCH|MONITOR)\.\s*$/;

  while (true) {
    const { data: batch, error } = await supabase
      .from("properties")
      .select("id, snap_insight")
      .like("snap_insight", "%.") // ends with period
      .limit(BATCH);

    if (error) {
      console.error("Select error:", error.message);
      break;
    }

    const toFix = (batch || []).filter((p: any) => labelPattern.test(p.snap_insight));
    if (toFix.length === 0) break;

    for (const p of toFix) {
      const fixed = p.snap_insight.replace(labelPattern, " $1");
      const { error: upErr } = await supabase
        .from("properties")
        .update({ snap_insight: fixed })
        .eq("id", p.id);
      if (!upErr) totalFixed++;
    }

    console.log(`Fixed ${totalFixed} so far...`);
    if (toFix.length < BATCH) break;
  }

  return new Response(JSON.stringify({ fixed: totalFixed }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
