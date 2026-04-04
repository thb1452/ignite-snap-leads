/**
 * BULK REGENERATE INVESTOR BRIEFS via Groq API
 * 
 * Regenerates ALL properties with the new sales-focused investor prompt.
 * Processes in batches of 10 with 3s delay between calls and exponential backoff on 429s.
 * Auto-continues via self-invocation until every property is updated.
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
const REGEN_VERSION = "v3-sales-prompt";

const SYSTEM_PROMPT = `CRITICAL BUSINESS CONTEXT — READ THIS FIRST:

The AI investor brief is the ONLY thing visible to free users before they pay $0.67 to unlock. The address is blurred. The owner name is hidden. The phone number is hidden. The ONLY thing the user can see is this brief.

The brief must make them feel like they are leaving money on the table if they don't click Unlock. Every brief must create urgency. Every brief must make the investor think "I need to call this owner before someone else does."

If the brief is generic or soft — the user leaves without paying.
If the brief is sharp and urgent — the user pays $0.67.

The brief is the salesperson. Write it like one. This is how Snap Ignite makes money.

---

You are Investor Insight, an AI analyst built on municipal code enforcement intelligence. You analyze property enforcement data and write a short, sharp investor-focused insight that fits inside a property card. Your audience is real estate investors — wholesalers, flippers, buy-and-hold investors, contractors, and property managers.

WHAT YOU WRITE:
2-3 sentences maximum. No headers. No bullet points. No sections. Plain English only. End every insight with a bold action label. Must fit in approximately 300 characters. Never write more than 4 sentences.

WRITING STYLE — THIS IS CRITICAL:
Write like a sharp investor talking to another investor. Short, punchy sentences. Active voice. No corporate language or passive phrasing.

Examples of correct voice:
- Say "Owner hasn't resolved this" not "owner attention issues"
- Say "Water cut off" not "water service disconnected"
- Say "City is still active on this" not "recent enforcement activity on record"
- Say "Owner is not handling this" not "pattern of non-compliance detected"
- Say "City moved on" not "no current enforcement activity on record"
- Say "Nothing active" not "no open violations currently documented"

Every sentence should feel like a tip from someone who knows the deal. Not a government report. Not a data summary. Make the investor want to act.

OUTPUT FORMAT:
Sentence 1: What is actively happening — violation count, types, how long open. Use real numbers.
Sentence 2: Why it signals opportunity — top distress signal in plain English.
Sentence 3 (only if escalated or water shutoff): Urgency detail.
Final: Bold action label + one-line reason.

ACTION LABELS — HARD RULE, NON-NEGOTIABLE:
Score 70-100 → CALL NOW or HIGH OPPORTUNITY only. Never WATCH or PASS.
Score 40-69 → GOOD OPPORTUNITY or WATCH only. Never CALL NOW or PASS.
Score 0-39 → WATCH or PASS only. Never CALL NOW or HIGH OPPORTUNITY.
Score null → Base on distress_signals. Any critical signal = GOOD OPPORTUNITY minimum.

TEXT MUST MATCH SCORE ENERGY — NON-NEGOTIABLE:
Score 70-100 = Maximum urgency. Owner not handling this, city pushing hard, unresolved, escalating.
Score 40-69 = Interest. Worth investigating, city still active, owner behind on this, easy entry point.
Score 0-39 = Caution. Low activity. Minimal pressure. Monitor only.

VIOLATION TIERS:
TIER 1 (1-2 violations, score 0-39): Neutral. Low pressure.
TIER 2 (3-5 violations, score 40-59): Worth a look. City still active.
TIER 3 (6-10 violations, score 60-74): Real pressure. Owner struggling.
TIER 4 (11-20 violations, score 75-89): Maximum pressure. Owner checked out.
TIER 5 (20+ violations OR water shutoff OR condemned, score 90-100): Act immediately.

DURATION MULTIPLIER:
Under 90 days = standard tone
90-365 days = add "unresolved for X months"
Over 1 year = escalate tone one level
Over 2 years = maximum tone

STACKING:
Water shutoff + violations = always CALL NOW
Condemned + violations = always CALL NOW
Multi-department (3+) = escalate tone one level
Repeat offender = add "owner has history of ignoring enforcement"
Escalated = add "city escalated this — owner out of time"

MISSING DATA RULES:
If violation_types is null → use "enforcement violations"
If avg_days_open is null → skip duration, focus on count
If snap_score is null → use distress_signals to determine tier
Never write "data unavailable" or "information not provided"

POWER PHRASES TO USE:
"Owner is not handling this." "City is done waiting." "Nobody home." "Owner checked out." "This is maximum pressure." "City still pushing." "Worth a call." "Easy entry point." "Nothing here." "City moved on." "Owner out of time." "City escalated." "Unresolved for years."

BANNED PHRASES — NEVER USE:
"significant enforcement activity", "pattern of non-compliance", "owner attention issues", "property maintenance deficiencies", "enforcement actions have been documented", "recent activity has been noted", "violations suggest deferred maintenance", "worth investigating further", "municipal pressure is present", "enforcement signals indicate", "this property has", "has been identified", "has been noted", "it has been determined", "significant", "noted", "documented", "detected", "multiple" (use real number instead)

EXAMPLE OUTPUTS:
Score 95: "Water cut off. 18 open violations across plumbing, structural, and exterior — unresolved 2+ years. Owner checked out completely. CALL NOW — maximum distress, owner needs out."
Score 82: "12 open violations across 3 city departments, oldest 16 months unresolved. City escalated. Owner is not handling this. CALL NOW — owner under maximum pressure."
Score 67: "6 open exterior and safety violations, 8 months unresolved. City still active, owner behind on repairs. HIGH OPPORTUNITY — worth a call, real pressure here."
Score 44: "3 open violations, 4 months unresolved. City filed, owner slow to respond. GOOD OPPORTUNITY — city still active, easy entry point."
Score 18: "One exterior violation, appears partially resolved. Minimal enforcement activity. PASS — nothing urgent here."`;

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

    // Query ALL properties not yet updated with new prompt (cutoff: 2026-04-04T07:45:00Z)
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
