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

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry") === "true";
  const batchLimit = parseInt(url.searchParams.get("limit") || "200");

  // Find duplicate groups
  const { data: groups, error: gErr } = await supabase.rpc("get_duplicate_property_groups", { batch_limit: batchLimit });

  if (gErr) {
    // Fallback: use raw query via a different approach
    // Get duplicates by querying properties directly
    const { data: allProps, error: pErr } = await supabase
      .from("properties")
      .select("id, address, city, state, snap_score, open_violations, total_violations")
      .order("address")
      .limit(1000);

    return new Response(JSON.stringify({ error: "Need RPC function", gErr: gErr.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  let totalMerged = 0;
  let totalDeleted = 0;
  const errors: string[] = [];

  for (const group of groups) {
    const winnerId = group.winner_id;
    const loserIds: string[] = group.loser_ids;

    if (!winnerId || !loserIds || loserIds.length === 0) continue;

    if (dryRun) {
      totalDeleted += loserIds.length;
      totalMerged++;
      continue;
    }

    try {
      // Reassign list_properties from losers to winner (skip if already exists)
      for (const loserId of loserIds) {
        // Get list_properties for loser
        const { data: lps } = await supabase
          .from("list_properties")
          .select("id, list_id, created_by")
          .eq("property_id", loserId);

        if (lps && lps.length > 0) {
          for (const lp of lps) {
            // Check if winner already in this list
            const { data: existing } = await supabase
              .from("list_properties")
              .select("id")
              .eq("list_id", lp.list_id)
              .eq("property_id", winnerId)
              .maybeSingle();

            if (!existing) {
              await supabase
                .from("list_properties")
                .update({ property_id: winnerId })
                .eq("id", lp.id);
            } else {
              // Already exists, just delete the orphan
              await supabase.from("list_properties").delete().eq("id", lp.id);
            }
          }
        }

        // Delete the loser property
        const { error: delErr } = await supabase.from("properties").delete().eq("id", loserId);
        if (delErr) errors.push(`Delete ${loserId}: ${delErr.message}`);
        else totalDeleted++;
      }
      totalMerged++;
    } catch (e) {
      errors.push(`Group ${winnerId}: ${e.message}`);
    }
  }

  return new Response(JSON.stringify({ 
    dryRun,
    groupsProcessed: totalMerged, 
    propertiesDeleted: totalDeleted,
    errors: errors.slice(0, 20),
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
