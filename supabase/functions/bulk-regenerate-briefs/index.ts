/**
 * BULK REGENERATE INVESTOR BRIEFS — Dual Provider (Lovable AI + Gemini)
 * v22-dual — Uses both providers for maximum throughput
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 100;
const REGEN_VERSION = "v22-dual";
const CONCURRENCY = 20;
const CUTOFF_TIMESTAMP = "2026-04-04T08:00:00Z";

const SYSTEM_PROMPT = `CRITICAL BUSINESS CONTEXT:

The AI investor brief is the ONLY thing visible to free users before they pay $0.67 to unlock. The address is blurred. The owner name is hidden. The phone number is hidden. The ONLY thing the user can see is this brief.

The brief must make them feel like they are leaving money on the table if they don't click Unlock. Every brief must create urgency.

You are Investor Insight, an AI analyst built on municipal code enforcement intelligence. Your audience is real estate investors.

WHAT YOU WRITE:
2-3 sentences maximum. No headers. No bullet points. No sections. Plain English only. Must fit in approximately 300 characters. Never write more than 4 sentences.

CRITICAL FORMATTING RULES:
DO NOT use dashes, hyphens, or em-dashes anywhere in your output. No "-" or "—" characters at all.
Instead of "CALL NOW — owner needs out" write "CALL NOW. Owner needs out."
Instead of "multi-department" write "multiple departments"
Use periods to separate thoughts, never dashes.

ABSOLUTELY FORBIDDEN — NEVER INCLUDE:
1. Property addresses, street names, or any location identifiers in your output
2. Raw violation codes, case numbers, or system codes (e.g. "ACC DF DS Harb IA IF HGW", "IPMC 305.4", "OSP Case create")
3. Owner names, phone numbers, emails, or any personal information
4. Raw database field values or system identifiers
5. Quoted raw text from violation descriptions — always paraphrase in plain English
If the input data contains garbled codes or abbreviations, interpret them as violation categories (structural, exterior, safety, zoning, etc.) and describe in plain language.

WRITING STYLE:
Write like a sharp investor talking to another investor. Short, punchy sentences. Active voice.

Examples of correct voice:
"Owner hasn't resolved this" not "owner attention issues"
"Water cut off" not "water service disconnected"
"City is still active on this" not "recent enforcement activity on record"
"Nothing active" not "no open violations currently documented"

OUTPUT FORMAT:
Sentence 1: What is actively happening. Violation count, types, how long open. Use real numbers.
Sentence 2: Why it signals opportunity. Top distress signal in plain English.
Final: Action label followed by a period and one line reason. NO DASHES before or after the label.

CRITICAL PLACEMENT RULE:
The action label (CALL NOW, HIGH OPPORTUNITY, GOOD OPPORTUNITY, WORTH A CALL, WATCH, PASS) MUST be the absolute last thing in the brief. Always end your analysis sentences first, then place the action label as the final element. Never place the action label in the middle of the brief. The label is always the closing statement.

ACTION LABELS:
Score 70 to 100: CALL NOW or HIGH OPPORTUNITY only.
Score 40 to 69: GOOD OPPORTUNITY or WATCH only.
Score 0 to 39: WATCH or PASS only.
Score null: Base on distress_signals.

TEXT MUST MATCH SCORE ENERGY:
Score 70 to 100 = Maximum urgency. Owner not handling this, city pushing hard.
Score 40 to 69 = Interest. Worth investigating, city still active.
Score 0 to 39 = Caution. Low activity. Minimal pressure.

EXAMPLE OUTPUTS:
Score 95: "Water cut off. 18 open violations across plumbing, structural, and exterior, unresolved 2+ years. Owner checked out completely. CALL NOW. Maximum distress, owner needs out."
Score 82: "12 open violations across 3 city departments, oldest 16 months unresolved. City escalated. Owner is not handling this. CALL NOW. Owner under maximum pressure."
Score 67: "6 open exterior and safety violations, 8 months unresolved. City still active, owner behind on repairs. HIGH OPPORTUNITY. Worth a call, real pressure here."
Score 44: "3 open violations, 4 months unresolved. City filed, owner slow to respond. GOOD OPPORTUNITY. City still active, easy entry point."
Score 18: "One exterior violation, appears partially resolved. Minimal enforcement activity. PASS. Nothing urgent here."

BANNED PHRASES:
"significant enforcement activity", "pattern of non-compliance", "owner attention issues", "property maintenance deficiencies", "enforcement actions have been documented", "violations suggest deferred maintenance", "worth investigating further", "municipal pressure is present", "enforcement signals indicate", "Noted:"`;

function formatPropertyData(prop: Record<string, any>): string {
  return `PROPERTY PROFILE:
Score: ${prop.snap_score ?? "unscored"} | Open: ${prop.open_violations ?? 0} | Total: ${prop.total_violations ?? 0}
Signals: ${(prop.distress_signals || []).join(", ") || "none"}
Types: ${(prop.violation_types || []).join(", ") || "none"}
Enforcement: ${prop.enforcement_type} | Escalated: ${prop.escalated ?? false} | Repeat: ${prop.repeat_offender ?? false}
Multiple Departments: ${prop.multi_department ?? false} | Avg Days Open: ${prop.avg_days_open ?? 0}
Newest: ${prop.newest_violation_date || "unknown"} | Oldest: ${prop.oldest_violation_date || "unknown"}`;
}

function isCleanBrief(text: string, prop: Record<string, any>): boolean {
  if (prop.address && text.toLowerCase().includes(prop.address.toLowerCase().slice(0, 10))) return false;
  if (/[A-Z]{2,}\s+[A-Z]{2,}\s+[A-Z]{2,}\s+[A-Z]{2,}/.test(text)) return false;
  if (/Noted:|Case\s+(create|number|#)/i.test(text)) return false;
  if (/IPMC\s+\d/i.test(text)) return false;
  if (/\(\d{3}\)\s?\d{3}|\d{3}[\-\.]\d{3}[\-\.]\d{4}|@\w+\.\w+/.test(text)) return false;
  if (text.length < 40) return false;
  return true;
}

// Provider 1: Lovable AI Gateway
async function generateViaLovable(prop: Record<string, any>, apiKey: string): Promise<string | null> {
  const userMessage = formatPropertyData(prop);
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        max_tokens: 400,
        temperature: 0.4,
      }),
    });

    if (res.status === 429 || res.status === 402) {
      const t = await res.text();
      console.warn(`[bulk-regen] Lovable ${res.status}: ${t.slice(0, 200)}`);
      return null;
    }
    if (!res.ok) {
      const t = await res.text();
      console.error(`[bulk-regen] Lovable ${res.status}: ${t.slice(0, 200)}`);
      return null;
    }

    const result = await res.json();
    return result?.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error(`[bulk-regen] Lovable network error:`, err);
    return null;
  }
}

// Provider 2: Gemini Direct
async function generateViaGemini(prop: Record<string, any>, apiKey: string): Promise<string | null> {
  const userMessage = formatPropertyData(prop);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `${SYSTEM_PROMPT}\n\n${userMessage}` }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 400 },
    }),
  });

  if (res.status === 429) { await res.text(); return null; }
  if (!res.ok) { const t = await res.text(); console.error(`[bulk-regen] Gemini ${res.status}: ${t.slice(0, 200)}`); return null; }

  const result = await res.json();
  return result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
}

async function generateBrief(
  prop: Record<string, any>,
  lovableKey: string,
  geminiKey: string,
): Promise<{ id: string; brief: string | null }> {
  let text: string | null = null;

  // Try Lovable first
  if (lovableKey) {
    text = await generateViaLovable(prop, lovableKey);
  }

  // Fallback to Gemini
  if (!text && geminiKey) {
    text = await generateViaGemini(prop, geminiKey);
  }

  if (text) {
    text = text.replace(/\s*[—–-]\s*/g, '. ').replace(/\.\.\s/g, '. ').replace(/\.\s\./g, '.');
    if (!isCleanBrief(text, prop)) {
      console.warn(`[bulk-regen] Rejected dirty brief for ${prop.id}`);
      return { id: prop.id, brief: null };
    }
  }

  return { id: prop.id, brief: text };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const headers = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";

    if (!GEMINI_API_KEY && !LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "No AI provider keys configured" }), { status: 500, headers });
    }

    const { autoResume = true, totalProcessed = 0, version = "" } = await req.json().catch(() => ({}));

    if (version && version !== REGEN_VERSION) {
      console.log(`[bulk-regen] Stopping old chain (version: ${version})`);
      return new Response(JSON.stringify({ stopped: true, reason: "version_mismatch" }), { headers });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: properties, error: fetchErr } = await supabase
      .from("properties")
      .select("id, address, city, state, zip, county, snap_score, distress_signals, violation_types, open_violations, total_violations, enforcement_type, escalated, repeat_offender, multi_department, avg_days_open, oldest_violation_date, newest_violation_date, opportunity_class")
      .or(`last_analyzed_at.is.null,last_analyzed_at.lt.${CUTOFF_TIMESTAMP}`)
      .order("snap_score", { ascending: false, nullsFirst: false })
      .range(0, BATCH_SIZE - 1);

    if (fetchErr) throw new Error(`Fetch error: ${fetchErr.message}`);
    if (!properties || properties.length === 0) {
      console.log(`[bulk-regen] ✅ ALL DONE! Total processed: ${totalProcessed}`);
      return new Response(JSON.stringify({
        success: true, done: true, totalProcessed, message: "All briefs regenerated!"
      }), { headers });
    }

    console.log(`[bulk-regen] Processing ${properties.length} (total so far: ${totalProcessed})`);

    let batchSuccess = 0;
    let batchFailed = 0;
    const lovableThrottled = { value: !LOVABLE_API_KEY };
    const geminiThrottled = { value: !GEMINI_API_KEY };

    for (let i = 0; i < properties.length; i += CONCURRENCY) {
      // Reset throttle flags each chunk so we retry
      if (i > 0) {
        lovableThrottled.value = !LOVABLE_API_KEY;
        geminiThrottled.value = !GEMINI_API_KEY;
      }

      const chunk = properties.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        chunk.map(p => generateBrief(p, LOVABLE_API_KEY, GEMINI_API_KEY, lovableThrottled, geminiThrottled))
      );

      for (const result of results) {
        if (!result.brief) { batchFailed++; continue; }
        const briefJson = {
          brief_text: result.brief,
          generated_at: new Date().toISOString(),
          model: "dual-provider",
          version: REGEN_VERSION,
        };
        const { error: updateErr } = await supabase
          .from("properties")
          .update({ snap_insight: result.brief, investor_insight_brief: briefJson, last_analyzed_at: new Date().toISOString() })
          .eq("id", result.id);
        if (updateErr) { batchFailed++; } else { batchSuccess++; }
      }

      if (i + CONCURRENCY < properties.length) await new Promise(r => setTimeout(r, 200));
    }

    const newTotal = totalProcessed + batchSuccess;
    console.log(`[bulk-regen] Batch: ${batchSuccess} ok, ${batchFailed} failed. Total: ${newTotal}`);

    const bothThrottled = lovableThrottled.value && geminiThrottled.value;
    const resumeDelay = bothThrottled ? 60000 : batchSuccess === 0 ? 30000 : 1000;

    if (autoResume) {
      const continueTask = async () => {
        await new Promise(r => setTimeout(r, resumeDelay));
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/bulk-regenerate-briefs`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ autoResume: true, totalProcessed: newTotal, version: REGEN_VERSION }),
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
      success: true, batchSuccess, batchFailed, totalProcessed: newTotal,
      hasMore: properties.length === BATCH_SIZE, autoResuming: autoResume,
      providers: { lovableThrottled: lovableThrottled.value, geminiThrottled: geminiThrottled.value },
    }), { headers });

  } catch (error) {
    console.error("[bulk-regen] Fatal:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers }
    );
  }
});
