/**
 * BULK REGENERATE INVESTOR BRIEFS via Groq API
 * 
 * Queries properties where investor_insight_brief is null, contains "fallback",
 * or is outdated. Regenerates using Groq's llama-3.3-70b-versatile model.
 * Processes in batches of 50 with 2s delay between batches.
 * Auto-continues via self-invocation.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const BATCH_SIZE = 10;
const DELAY_BETWEEN_CALLS_MS = 3000;
const DELAY_BETWEEN_BATCHES_MS = 5000;
const MAX_RETRIES = 3;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const headers = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");

    if (!GROQ_API_KEY) {
      return new Response(JSON.stringify({ error: "GROQ_API_KEY not configured" }), { status: 500, headers });
    }

    const { autoResume = true, totalProcessed = 0 } = await req.json().catch(() => ({}));
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Query properties needing brief regeneration — target ALL not yet updated with new prompt
    const { data: properties, error: fetchErr } = await supabase
      .from("properties")
      .select("id, address, city, state, zip, county, snap_score, snap_insight, distress_signals, violation_types, open_violations, total_violations, enforcement_type, escalated, repeat_offender, multi_department, avg_days_open, oldest_violation_date, newest_violation_date, opportunity_class, investor_insight_brief")
      .or("last_analyzed_at.is.null,last_analyzed_at.lt.2026-04-04T07:45:00Z")
      .order("snap_score", { ascending: false, nullsFirst: false })
      .range(0, BATCH_SIZE - 1);

    if (fetchErr) throw new Error(`Fetch error: ${fetchErr.message}`);
    if (!properties || properties.length === 0) {
      console.log(`[bulk-regen] ✅ COMPLETE! Total processed: ${totalProcessed}`);
      return new Response(JSON.stringify({ 
        success: true, done: true, totalProcessed, message: "All briefs regenerated" 
      }), { headers });
    }

    console.log(`[bulk-regen] Processing batch of ${properties.length} (total so far: ${totalProcessed})`);

    let batchSuccess = 0;
    let batchFailed = 0;
    let rateLimited = false;

    for (const prop of properties) {
      try {
        const userMessage = formatPropertyData(prop);
        let briefText: string | null = null;

        // Retry loop with exponential backoff for rate limits
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          const aiRes = await fetch(GROQ_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${GROQ_API_KEY}`,
            },
            body: JSON.stringify({
              model: GROQ_MODEL,
              max_tokens: 500,
              messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: userMessage },
              ],
              temperature: 0.4,
            }),
          });

          if (aiRes.ok) {
            const result = await aiRes.json();
            briefText = result?.choices?.[0]?.message?.content?.trim() || null;
            break;
          }

          if (aiRes.status === 429) {
            const retryAfter = parseInt(aiRes.headers.get("retry-after") || "0") || 0;
            const backoffMs = Math.max(retryAfter * 1000, (attempt + 1) * 10000);
            console.warn(`[bulk-regen] Rate limited on ${prop.id}, waiting ${backoffMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
            await new Promise(r => setTimeout(r, backoffMs));
            continue;
          }

          // Non-retryable error
          const errText = await aiRes.text();
          console.error(`[bulk-regen] Groq error for ${prop.id}: ${aiRes.status} ${errText}`);
          break;
        }

        if (!briefText) {
          batchFailed++;
          await new Promise(r => setTimeout(r, DELAY_BETWEEN_CALLS_MS));
          continue;
        }

        const briefJson = {
          brief_text: briefText,
          generated_at: new Date().toISOString(),
          model: GROQ_MODEL,
          property_snap_score: prop.snap_score,
        };

        const { error: updateErr } = await supabase
          .from("properties")
          .update({
            snap_insight: briefText,
            investor_insight_brief: briefJson,
            last_analyzed_at: new Date().toISOString(),
          })
          .eq("id", prop.id);

        if (updateErr) {
          console.error(`[bulk-regen] Update error for ${prop.id}:`, updateErr.message);
          batchFailed++;
        } else {
          batchSuccess++;
        }

        // Delay between individual calls to respect rate limits
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_CALLS_MS));

      } catch (err) {
        console.error(`[bulk-regen] Error processing ${prop.id}:`, err);
        batchFailed++;
      }
    }

    const newTotal = totalProcessed + batchSuccess;
    
    // Log progress every batch
    if (newTotal % 1000 < BATCH_SIZE) {
      console.log(`[bulk-regen] 📊 MILESTONE: Regenerated ${newTotal} of 457,423 properties`);
    }
    console.log(`[bulk-regen] Batch done: ${batchSuccess} success, ${batchFailed} failed. Total: ${newTotal}`);

    // Auto-continue — always resume if there are more properties
    if (autoResume && properties.length > 0) {
      const continueTask = async () => {
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/bulk-regenerate-briefs`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ autoResume: true, totalProcessed: newTotal }),
          });
        } catch (err) {
          console.error("[bulk-regen] Auto-resume failed:", err);
        }
      };

      const runtime = (globalThis as any).EdgeRuntime;
      if (runtime?.waitUntil) {
        runtime.waitUntil(continueTask());
      } else {
        continueTask().catch(console.error);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      batchSuccess,
      batchFailed,
      totalProcessed: newTotal,
      hasMore: properties.length === BATCH_SIZE,
      autoResuming: autoResume && properties.length > 0,
    }), { headers });

  } catch (error) {
    console.error("[bulk-regen] Fatal:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers }
    );
  }
});

function formatPropertyData(prop: Record<string, any>): string {
  return `PROPERTY: ${prop.address}, ${prop.city || ""}, ${prop.state || ""} ${prop.zip || ""}
Score: ${prop.snap_score ?? "unscored"} | Open: ${prop.open_violations ?? 0} | Total: ${prop.total_violations ?? 0}
Signals: ${(prop.distress_signals || []).join(", ") || "none"}
Types: ${(prop.violation_types || []).join(", ") || "none"}
Enforcement: ${prop.enforcement_type} | Escalated: ${prop.escalated ?? false} | Repeat: ${prop.repeat_offender ?? false}
Multi-Dept: ${prop.multi_department ?? false} | Avg Days Open: ${prop.avg_days_open ?? 0}
Newest: ${prop.newest_violation_date || "unknown"} | Oldest: ${prop.oldest_violation_date || "unknown"}`;
}
