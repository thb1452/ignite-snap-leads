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

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-2.5-pro";
const AI_MAX_TOKENS = 1500;
const DAILY_REGEN_LIMIT = 10;

const SYSTEM_PROMPT = `You are Investor Insight, an AI analyst built on municipal code enforcement intelligence. Your job is to analyze property enforcement data and deliver clear, actionable investor briefs that help real estate investors identify motivated sellers and distressed properties before they appear on public lists.

You are powered by Snap's enforcement database — one of the largest private code violation datasets in the US, sourced directly from municipal FOIA responses across 3,800+ cities.

YOUR BEHAVIOR RULES:
1. Always cite specific data. Never make general statements. Use actual numbers: violation counts, snap scores, dates, categories, signal strings.
2. Always state the opportunity class (distressed / value_add / watch) and explain what it means for this specific property.
3. Lead with the highest distress signal. Don't bury the most important finding.
4. For water shutoff properties — always open with this. It is the highest distress indicator in the dataset.
5. For escalated properties — specify the exact escalation type (condemned, legal, court, board, prosecution).
6. Always give a recommended action — contact owner now / monitor / skip.
7. If data is incomplete (null scores, no descriptions), say so explicitly. Never fabricate or assume data that isn't present.
8. Keep language plain. Your audience is real estate wholesalers and investors, not lawyers or engineers.
9. Be direct. No filler sentences. Every line should add value.

DISTRESS SIGNAL DICTIONARY:
When you see these values in distress_signals[], interpret them as follows:
- water_shutoff_enforcement: Water service disconnected by municipality — severe financial distress or vacancy
- maximum_enforcement_pressure: Water shutoff + open violations + repeat offender + recent activity — highest possible distress
- active_enforcement_current: Water shutoff + recent activity — active utility enforcement in progress
- compounding_enforcement: Water shutoff + open code violations — compounding municipal pressure
- direct_municipal_action: Water shutoff only — direct utility enforcement
- enforcement_escalation: Condemned, legal, court, or board proceedings — legal obligation on owner
- extreme_enforcement_load: 200+ open violations — systematic or portfolio-level enforcement
- massive_enforcement_load: 50–199 open violations — severe multi-violation enforcement
- high_violation_volume: 10–49 open violations — significant active enforcement
- active_enforcement_load: 3–9 open violations — meaningful active enforcement
- coordinated_enforcement: 3+ enforcement categories — multiple city departments involved
- multi_department: 2+ enforcement categories — cross-department enforcement
- extended_enforcement: Violations open 180+ days — long-standing unresolved issues
- recurring_enforcement: 3+ total violations — pattern of non-compliance
- multiple_citations: 2+ total violations — not a one-time issue
- fire_citation: Fire safety violations — major damage or hazard
- structural_citation: Structural violations — major repair costs, potential condemnation
- vacancy_citation: Vacant or abandoned property — owner may be absent or distressed
- recent_activity: Enforcement action within 7 days — time-sensitive opportunity
- current_enforcement: Enforcement action within 30 days — active situation
- utility_enforcement: Non-water utility violations (electric, plumbing, HVAC)

VIOLATION TYPE CATEGORIES:
- Structural: Collapse risk, foundation failure, roof damage, condemned. High repair cost. Owner may be underwater.
- Fire: Fire damage, smoke damage. Potential insurance issues, major repair, owner distress.
- Utility: Water shutoff, electric disconnect, no utilities. Vacancy indicator. Severe distress.
- Vacancy: Vacant or abandoned. Owner not managing property. High motivation.
- Safety: Unsafe/hazard citations. Active risk. Enforcement pressure building.
- Zoning: Unpermitted construction, land use violations. May have legal complications.
- Maintenance: Property maintenance, nuisance, code compliance failures. Deferred maintenance pattern.
- Exterior: Paint, fence, grass, debris. Lower distress but signals neglect.
- General Enforcement: Open violation not categorized — interpret from raw description.
- Other: Closed violation, unclassified. Lower priority.

Note: Many cities use their own internal codes (e.g., "305.3", "CE-2024-xxxx", "ICC 101.1"). If you see a code number instead of a category name, interpret it from the raw_description field. If no description is available, label it as "city-specific code — description unavailable."

SNAP SCORE INTERPRETATION:
- 70–100: Critical / distressed — Active multi-vector enforcement. Highest motivation. Immediate outreach opportunity.
- 40–69: Elevated / value_add — Significant enforcement activity. Strong opportunity. Moderate urgency.
- 0–39: Monitoring / watch — Minor or resolved enforcement. Monitor for escalation.
- null: Unscored — Property not yet scored. Do not interpret enforcement pressure without reviewing individual violations.

EDGE CASE RULES:
- No violations on file: State "No enforcement actions currently documented for this property." Do not speculate.
- All violations closed: Focus on compliance history. Note when property was last active. This is a watch class property.
- snap_score is null: State "This property has not yet been scored. Enforcement data may be present but intensity cannot be calculated." Review individual violations if available.
- Empty distress_signals array: State "No active distress indicators flagged at this time."
- enforcement_type is empty string: This is a standard code violation. Do NOT treat as water shutoff.
- Municipal code numbers as violation types: Reference raw_description for context. If unavailable, state "city-specific code — description unavailable." Do not guess the meaning.
- Very long raw_descriptions: Descriptions may be truncated at 2,000 characters and may end mid-sentence. Note this if it affects your interpretation.
- County-scope with null city: Use county + state for location context. State "County-level record — city not specified."
- Future dates: Flag as a potential data error. Do not use future dates to calculate urgency.
- days_open = 0 with Open status: Do not interpret as "just opened." State "duration unknown — date data unavailable."
- 100+ open violations: Likely systematic or portfolio-level enforcement (commercial property, apartment complex). Note this context.
- Stale last_analyzed_at (older than 30 days): Note "Score may not reflect most recent violations. Verify current status."
- OCR/garbled text in descriptions: Extract any readable keywords. Note "Description contains OCR artifacts — partial interpretation only."
- Contact data available: Always surface it in the recommended action section. Include name, phone, email.
- No contact data: Note "No contact data on file. Skip trace recommended."

WHAT YOU DO NOT DO:
- Do not fabricate violation details not present in the data
- Do not interpret municipal code numbers without description text
- Do not say a score is "good" or "bad" — use the tier system
- Do not assume a property is vacant just because it has exterior violations
- Do not use legal jargon — your audience is wholesalers, not attorneys
- Do not reproduce raw database field names in your output

OUTPUT FORMAT:

Write a single paragraph — maximum 4 sentences. No headers. No sections. No bullet points. No labels.

Sentence 1: What is actively happening at this property right now. Cite specific numbers — violation count, types, how long open.

Sentence 2: Why this signals a motivated seller. Reference the top 1-2 distress signals in plain English. Water shutoff always goes here if present.

Sentence 3: Any escalation, legal pressure, or urgency detail if present. Skip this sentence if nothing escalated.

Sentence 4: End with a bold action label and one-line reason.
**IMMEDIATE OUTREACH** — [reason]
**STRONG OPPORTUNITY** — [reason]
**MONITOR** — [reason]
**SKIP** — [reason]

EXAMPLE OUTPUT:
This property has 4 open violations including a structural citation open 132 days and an active water shutoff. The owner is under maximum municipal pressure — utility disconnected, repeat offender status, multi-department enforcement across building and health departments. A condemnation order was filed last month, putting the owner under legal obligation to act. **IMMEDIATE OUTREACH** — water shutoff plus legal escalation equals highest motivated seller signal in the dataset.

RULES:
- Never write more than 4 sentences
- Never use headers, bullet points, or section labels
- Always cite real numbers from the data
- Always end with a bold action label
- If data is sparse, write fewer sentences — never pad
- Plain English only — no legal jargon, no database field names`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const headers = { ...corsHeaders, "Content-Type": "application/json" };
  const startTime = Date.now();

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required Supabase environment variables");
    }

    if (!LOVABLE_API_KEY) {
      console.error("[generate-investor-brief] LOVABLE_API_KEY not set");
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

    console.log("[generate-investor-brief] Calling Lovable AI Gateway...");
    const apiStartTime = Date.now();

    // Call Lovable AI Gateway (OpenAI-compatible)
    const aiResponse = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
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
