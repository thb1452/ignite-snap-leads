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

  // Target specific patterns: "PASS.", "OPPORTUNITY.", etc.
  const targets = ["PASS.", "OPPORTUNITY.", "HIGH OPPORTUNITY.", "GOOD OPPORTUNITY.", "WORTH A CALL.", "CALL NOW.", "WATCH.", "MONITOR."];
  
  for (const suffix of targets) {
    const cleanLabel = suffix.slice(0, -1); // Remove the period
    let round = 0;
    
    while (round < 100) {
      const { data: batch, error } = await supabase
        .from("properties")
        .select("id")
        .like("snap_insight", `%${suffix}`)
        .limit(BATCH);

      if (error || !batch || batch.length === 0) break;

      const ids = batch.map((p: any) => p.id);
      
      // Update each one
      for (const id of ids) {
        const { data: prop } = await supabase
          .from("properties")
          .select("snap_insight")
          .eq("id", id)
          .single();
        
        if (prop?.snap_insight) {
          const fixed = prop.snap_insight.replace(new RegExp(`\\s*${suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`), ` ${cleanLabel}`);
          await supabase.from("properties").update({ snap_insight: fixed }).eq("id", id);
        }
      }

      totalFixed += ids.length;
      round++;
      console.log(`${suffix}: round ${round}, fixed ${ids.length} (total: ${totalFixed})`);
    }
  }

  return new Response(JSON.stringify({ fixed: totalFixed }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
