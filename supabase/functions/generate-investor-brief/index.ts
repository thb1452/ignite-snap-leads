/**
 * GENERATE INVESTOR BRIEF — Edge Function (v2.1)
 *
 * Accepts a property_id, fetches full property + violation + contact data,
 * calls Lovable AI (Gemini 2.5 Pro) to generate a structured investor brief,
 * and returns the brief as JSON.
 *
 * v2.1: Migrated from Anthropic Claude to Lovable AI gateway
 * - Rate limiting: 10 regenerations per property per user per day
 * - Token usage tracking: logs input/output tokens per call
 * - Structured monitoring: latency, status, error tracking
 * - newest_violation_date returned for stale-brief detection
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const AI_GATEWAY_URL = "https://api.groq.com/openai/v1/chat/completions";
const AI_MODEL = "llama-3.3-70b-versatile";
const AI_MAX_TOKENS = 1500;
const DAILY_REGEN_LIMIT = 10;

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

CRITICAL PLACEMENT RULE:
The action label (CALL NOW, HIGH OPPORTUNITY, GOOD OPPORTUNITY, WORTH A CALL, WATCH, PASS) MUST be the absolute last thing in the brief. Always end your analysis sentences first, then place the action label as the final element. Never place the action label in the middle of the brief. The label is always the closing statement.

ACTION LABELS — HARD RULE, NON-NEGOTIABLE:
The action label MUST match the snap_score tier. Never contradict the score.

Score 70-100 → CALL NOW or HIGH OPPORTUNITY only. Never WATCH or PASS.
Score 40-69 → GOOD OPPORTUNITY or WATCH only. Never CALL NOW or PASS.
Score 0-39 → WATCH or PASS only. Never CALL NOW or HIGH OPPORTUNITY.
Score null → Base on distress_signals. Any critical signal = GOOD OPPORTUNITY minimum.

TEXT MUST MATCH SCORE ENERGY — NON-NEGOTIABLE:
Score 70-100 = Write with maximum urgency. Use: maximum pressure, owner not handling this, city pushing hard, unresolved, escalating, hasn't responded. Never use soft words like minor, small, limited, low, quiet.

Score 40-69 = Write with interest. Use: worth investigating, city still active, owner behind on this, easy entry point, worth a call.

Score 0-39 = Write with caution. Low activity. Minimal pressure. Could be resolved. Monitor only.

VIOLATION TIERS — MATCH INSIGHT INTENSITY TO TIER:

TIER 1 (1-2 violations, score 0-39):
Tone: Neutral. Low pressure. Minimal urgency.
"One open exterior violation, 45 days unresolved. City filed and moved on. Owner responded partially. WATCH — low pressure, check for updates."

TIER 2 (3-5 violations, score 40-59):
Tone: Interested. Worth a look. City still active.
"3 open violations across exterior and structural, oldest 8 months unresolved. City still pushing. Owner behind on this. GOOD OPPORTUNITY — worth a call."

TIER 3 (6-10 violations, score 60-74):
Tone: Engaged. Real pressure. Owner struggling.
"7 open violations, multi-department, 14 months unresolved. Owner is not handling this. City still active. HIGH OPPORTUNITY — owner under real pressure."

TIER 4 (11-20 violations, score 75-89):
Tone: Urgent. Maximum pressure. Owner checked out.
"13 open violations across 3 departments, 2+ years unresolved. Owner checked out. City done waiting. CALL NOW — maximum enforcement pressure."

TIER 5 (20+ violations OR water shutoff OR condemned, score 90-100):
Tone: Maximum urgency. Act immediately. This brief should make any investor stop scrolling and pay to unlock.
"Water cut off. 22 open violations, condemned structure, 3+ years. Nobody home. This is the highest distress signal possible. CALL NOW — owner needs out immediately."

DURATION MULTIPLIER — ADD URGENCY FOR TIME:
Under 90 days = standard tone
90-365 days = add "unresolved for X months"
Over 1 year = add "over a year unresolved" — escalate tone one level
Over 2 years = add "2+ years, owner hasn't moved" — maximum tone

STACKING — WHEN MULTIPLE SIGNALS EXIST:
Water shutoff + violations = always CALL NOW regardless of score
Condemned + violations = always CALL NOW regardless of score
Multi-department (3+) = escalate tone one level above score tier
Repeat offender = add "owner has history of ignoring enforcement"
Escalated = add "city escalated this — owner out of time"

MISSING DATA RULES:
If violation_types is null → use "enforcement violations"
If avg_days_open is null → skip duration, focus on count
If snap_score is null → use distress_signals to determine tier
Never write "data unavailable" or "information not provided"
Never soften tone because data is missing — fill with what you know

POWER PHRASES TO USE:
"Owner is not handling this."
"City is done waiting."
"Nobody home."
"Owner checked out."
"This is maximum pressure."
"Owner can't afford the fix."
"City still pushing."
"Worth a call."
"Easy entry point."
"Nothing here."
"City moved on."
"Owner under obligation to act."
"This place is empty."
"Owner out of time."
"City escalated."
"Unresolved for years."
"Nobody answering."

BANNED PHRASES — NEVER USE THESE:
"significant enforcement activity"
"pattern of non-compliance has been detected"
"owner attention issues"
"property maintenance deficiencies"
"enforcement actions have been documented"
"recent activity has been noted"
"violations suggest deferred maintenance"
"worth investigating further"
"municipal pressure is present"
"enforcement signals indicate"
"this property has"
"has been identified"
"has been noted"
"it has been determined"
"significant"
"noted"
"documented"
"detected"
"multiple" (use real number instead)

EXAMPLE OUTPUTS — THESE ARE THE GOLD STANDARD:

Score 95 — Water shutoff + 18 violations:
"Water cut off. 18 open violations across plumbing, structural, and exterior — unresolved 2+ years. Owner checked out completely. CALL NOW — maximum distress, owner needs out."

Score 82 — 12 violations, multi-department:
"12 open violations across 3 city departments, oldest 16 months unresolved. City escalated. Owner is not handling this. CALL NOW — owner under maximum pressure."

Score 67 — 6 violations, 8 months:
"6 open exterior and safety violations, 8 months unresolved. City still active, owner behind on repairs. HIGH OPPORTUNITY — worth a call, real pressure here."

Score 44 — 3 violations, 4 months:
"3 open violations, 4 months unresolved. City filed, owner slow to respond. GOOD OPPORTUNITY — city still active, easy entry point."

Score 18 — 1 violation, resolved:
"One exterior violation, appears partially resolved. Minimal enforcement activity. PASS — nothing urgent here."`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const headers = { ...corsHeaders, "Content-Type": "application/json" };
  const startTime = Date.now();

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required Supabase environment variables");
    }

    if (!GROQ_API_KEY) {
      console.error("[generate-investor-brief] GROQ_API_KEY not set");
      logMonitoring({ status: "error", error: "missing_api_key", latency_ms: Date.now() - startTime });
      return new Response(
        JSON.stringify({ error: "brief_unavailable" }),
        { status: 500, headers }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify JWT
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      logMonitoring({ status: "auth_error", error: "missing_token", latency_ms: Date.now() - startTime });
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authData?.user) {
      logMonitoring({ status: "auth_error", error: authErr?.message || "invalid_token", latency_ms: Date.now() - startTime });
      return new Response(
        JSON.stringify({ error: "Unauthorized", code: "AUTH_EXPIRED" }),
        { status: 401, headers }
      );
    }

    const userId = authData.user.id;

    // Parse request body
    const { property_id } = await req.json();
    if (!property_id) {
      return new Response(
        JSON.stringify({ error: "property_id is required" }),
        { status: 400, headers }
      );
    }

    console.log("[generate-investor-brief] Processing property:", property_id, "user:", userId);

    // ── Rate Limiting: 10 regenerations per property per user per day ──
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const { count: regenCount } = await supabase
      .from("system_logs")
      .select("*", { count: "exact", head: true })
      .eq("event_type", "investor_brief_generated")
      .eq("user_id", userId)
      .contains("metadata", { property_id })
      .gte("created_at", todayStart.toISOString());

    if ((regenCount ?? 0) >= DAILY_REGEN_LIMIT) {
      console.warn("[generate-investor-brief] Rate limit hit:", userId, property_id, regenCount);
      logMonitoring({ status: "rate_limited", property_id, user_id: userId, latency_ms: Date.now() - startTime });
      return new Response(
        JSON.stringify({
          error: "rate_limit_exceeded",
          message: `Daily regeneration limit reached (${DAILY_REGEN_LIMIT}/day). Try again tomorrow.`,
          limit: DAILY_REGEN_LIMIT,
        }),
        { status: 429, headers }
      );
    }

    // Fetch full property record
    const { data: property, error: propError } = await supabase
      .from("properties")
      .select(`
        id, address, city, state, zip, county,
        snap_score, snap_insight, distress_signals, violation_types,
        open_violations, total_violations, enforcement_type,
        escalated, repeat_offender, multi_department,
        avg_days_open, oldest_violation_date, newest_violation_date,
        last_analyzed_at, last_enforcement_date, opportunity_class
      `)
      .eq("id", property_id)
      .maybeSingle();

    if (propError) {
      console.error("[generate-investor-brief] Error fetching property:", propError);
      logMonitoring({ status: "error", error: "property_fetch_failed", property_id, latency_ms: Date.now() - startTime });
      return new Response(
        JSON.stringify({ error: "brief_unavailable" }),
        { status: 500, headers }
      );
    }

    if (!property) {
      return new Response(
        JSON.stringify({ error: "Property not found" }),
        { status: 404, headers }
      );
    }

    // Fetch all violations for this property
    const { data: violations, error: violError } = await supabase
      .from("violations")
      .select("violation_type, status, raw_description, days_open, opened_date, case_id")
      .eq("property_id", property_id)
      .order("opened_date", { ascending: false });

    if (violError) {
      console.error("[generate-investor-brief] Error fetching violations:", violError);
    }

    const violationRecords = violations || [];

    // Fetch property contacts (optional)
    const { data: contacts } = await supabase
      .from("property_contacts")
      .select("name, phone, email, source")
      .eq("property_id", property_id);

    const contactRecords = contacts || [];

    // Format the property data block
    const userMessage = formatPropertyData(property, violationRecords, contactRecords);

    console.log("[generate-investor-brief] Calling Groq API...");
    const apiStartTime = Date.now();

    // Call Groq API (OpenAI-compatible)
    const aiResponse = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: AI_MAX_TOKENS,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: 0.4,
      }),
    });

    const apiLatency = Date.now() - apiStartTime;

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("[generate-investor-brief] AI Gateway error:", aiResponse.status, errText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "rate_limited", message: "AI rate limit exceeded. Please try again shortly." }),
          { status: 429, headers }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "credits_exhausted", message: "AI credits exhausted. Please add more credits." }),
          { status: 402, headers }
        );
      }

      logMonitoring({
        status: "api_error",
        error: `ai_gateway_${aiResponse.status}`,
        property_id,
        api_latency_ms: apiLatency,
        latency_ms: Date.now() - startTime,
      });
      return new Response(
        JSON.stringify({ error: "brief_unavailable" }),
        { status: 500, headers }
      );
    }

    const aiResult = await aiResponse.json();
    const aiText = aiResult?.choices?.[0]?.message?.content?.trim();

    // ── Token usage tracking ──
    const usage = aiResult?.usage;
    const inputTokens = usage?.prompt_tokens ?? 0;
    const outputTokens = usage?.completion_tokens ?? 0;

    if (!aiText) {
      console.error("[generate-investor-brief] Empty AI response");
      logMonitoring({
        status: "error",
        error: "empty_ai_response",
        property_id,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        api_latency_ms: apiLatency,
        latency_ms: Date.now() - startTime,
      });
      return new Response(
        JSON.stringify({ error: "brief_unavailable" }),
        { status: 500, headers }
      );
    }

    // Parse the AI response into sections
    const brief = parseAIBrief(aiText, property.snap_score, property.newest_violation_date);

    const totalLatency = Date.now() - startTime;

    // ── Log to system_logs for rate limiting + monitoring ──
    await supabase.from("system_logs").insert({
      event_type: "investor_brief_generated",
      user_id: userId,
      metadata: {
        property_id,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
        api_latency_ms: apiLatency,
        total_latency_ms: totalLatency,
        model: AI_MODEL,
        brief_text_preview: brief.brief_text.slice(0, 50),
        snap_score: property.snap_score,
        opportunity_class: property.opportunity_class,
      },
    }).then(({ error }) => {
      if (error) console.error("[generate-investor-brief] Failed to log to system_logs:", error);
    });

    logMonitoring({
      status: "success",
      property_id,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      api_latency_ms: apiLatency,
      latency_ms: totalLatency,
      brief_text_preview: brief.brief_text.slice(0, 30),
    });

    console.log(`[generate-investor-brief] Brief generated for ${property_id} | tokens: ${inputTokens}+${outputTokens} | api: ${apiLatency}ms | total: ${totalLatency}ms`);

    return new Response(JSON.stringify(brief), { headers });

  } catch (error) {
    const totalLatency = Date.now() - startTime;
    console.error("[generate-investor-brief] Fatal error:", error instanceof Error ? error.message : error);
    logMonitoring({ status: "fatal_error", error: error instanceof Error ? error.message : String(error), latency_ms: totalLatency });
    return new Response(
      JSON.stringify({ error: "brief_unavailable" }),
      { status: 500, headers }
    );
  }
});

// ── Structured monitoring log ──
function logMonitoring(data: Record<string, unknown>) {
  console.log(JSON.stringify({ _monitor: "investor_brief", timestamp: new Date().toISOString(), ...data }));
}

function formatPropertyData(
  property: Record<string, any>,
  violations: Record<string, any>[],
  contacts: Record<string, any>[]
): string {
  const lines: string[] = ["PROPERTY DATA:", ""];

  lines.push(`Address: ${property.address}, ${property.city || "not specified"}, ${property.state || ""} ${property.zip || ""}`);
  lines.push(`County: ${property.county || "not specified"}`);
  lines.push(`Snap Score: ${property.snap_score ?? "not yet scored"}`);
  lines.push(`Opportunity Class: ${property.opportunity_class || "unknown"}`);
  lines.push(`Total Violations: ${property.total_violations ?? 0}`);
  lines.push(`Open Violations: ${property.open_violations ?? 0}`);
  lines.push(`Violation Types: ${(property.violation_types || []).join(", ") || "none"}`);
  lines.push(`Distress Signals: ${(property.distress_signals || []).join(", ") || "none"}`);
  lines.push(`Enforcement Type: ${property.enforcement_type === "water_shutoff" ? "water_shutoff" : "standard code violation"}`);
  lines.push(`Repeat Offender: ${property.repeat_offender ?? false}`);
  lines.push(`Multi-Department: ${property.multi_department ?? false}`);
  lines.push(`Escalated: ${property.escalated ?? false}`);
  lines.push(`Avg Days Open: ${property.avg_days_open ?? "unknown"}`);
  lines.push(`Oldest Violation Date: ${property.oldest_violation_date || "unknown"}`);
  lines.push(`Newest Violation Date: ${property.newest_violation_date || "unknown"}`);
  lines.push(`Last Enforcement Date: ${property.last_enforcement_date || "unknown"}`);
  lines.push(`Score Last Updated: ${property.last_analyzed_at || "unknown"}`);
  lines.push(`Existing Snap Insight: ${property.snap_insight || "none"}`);

  lines.push("");
  lines.push(`INDIVIDUAL VIOLATIONS (${violations.length} records):`);

  if (violations.length === 0) {
    lines.push("- No violation records on file");
  } else {
    for (const v of violations) {
      lines.push(`- Type: ${v.violation_type || "unknown"} | Status: ${v.status || "unknown"} | Days Open: ${v.days_open ?? "unknown"} | Opened: ${v.opened_date || "unknown"} | Case: ${v.case_id || "none"}`);
      lines.push(`  Description: ${v.raw_description || "no description available"}`);
    }
  }

  lines.push("");
  lines.push("CONTACT DATA:");
  if (contacts.length > 0) {
    for (const c of contacts) {
      lines.push(`- Name: ${c.name || "unknown"} | Phone: ${c.phone || "unknown"} | Email: ${c.email || "unknown"} | Source: ${c.source || "unknown"}`);
    }
  } else {
    lines.push("- No contact data on file");
  }

  return lines.join("\n");
}

function parseAIBrief(
  aiText: string,
  snapScore: number | null,
  newestViolationDate: string | null
): {
  brief_text: string;
  generated_at: string;
  property_snap_score: number | null;
  newest_violation_date: string | null;
} {
  return {
    brief_text: aiText.trim(),
    generated_at: new Date().toISOString(),
    property_snap_score: snapScore,
    newest_violation_date: newestViolationDate,
  };
}
