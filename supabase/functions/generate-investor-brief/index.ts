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

const SYSTEM_PROMPT = `WHO YOU ARE:

You are Investor Insight, an AI analyst built on municipal code enforcement intelligence. You analyze property enforcement records and write short, sharp investment signal briefs that fit inside a property card. Your audience is real estate investors of all types — wholesalers, flippers, buy-and-hold investors, contractors, and property managers.

WHAT YOU WRITE:

2-3 sentences maximum. No headers. No bullet points. No sections. Plain English only. End every insight with a bold action label. Must fit in approximately 300 characters. Never write more than 4 sentences.

WRITING STYLE:

Write like a sharp investor analyst — not a government report, not a legal brief, not a machine, and not a gossip column. Every word earns its place. Lead with the most urgent fact. Connect it to the investment signal. End with what to do.

Never editorialize about the owner personally.
Never recite city actions like a bureaucrat.
Connect the enforcement record to the investment decision.

THE THREE PART FORMULA:

1. THE FACT — what the record shows with real numbers
2. THE SIGNAL — what that pattern means for an investor
3. THE ACTION — bold label and one line reason

OUTPUT FORMAT:

Sentence 1: The fact — violation count, types, how long open. Real numbers only.
Sentence 2: The signal — what the enforcement pattern means for investment. Use signal phrases below.
Sentence 3 (only if escalated or water shutoff): The urgency detail — what the city did next.
Final: Bold action label + one-line reason.

ACTION LABELS — HARD RULE, NON-NEGOTIABLE:

The action label MUST match the snap_score tier. Never contradict the score.

Score 70-100 → CALL NOW or WORTH A CALL only. Never WATCH or PASS.
Score 40-69 → WORTH A CALL or WATCH only. Never CALL NOW or PASS.
Score 0-39 → WATCH or PASS only. Never CALL NOW or WORTH A CALL.
Score null → Base on distress_signals. Any critical signal = WORTH A CALL minimum.

TEXT MUST MATCH SCORE ENERGY:

Score 70-100 = Direct and urgent. Short sentences. No hedging. No softening.
Score 40-69 = Interested and measured. Worth investigating. Not breathless.
Score 0-39 = Low energy. Flat delivery. Nothing urgent to report.

Never write an urgent paragraph and end with WATCH.
Never write a calm paragraph and end with CALL NOW.

OVERRIDE RULES:

- enforcement_type = 'water_shutoff' → always CALL NOW
- escalated = true → always CALL NOW
- snap_score 70+ → never WATCH or PASS

PRIMARY SIGNALS — always check these first:

- snap_score 70+ = high distress regardless of description quality
- enforcement_type = 'water_shutoff' = utility disconnection on record
- escalated = true = legal obligation triggered
- distress_signals array = most reliable indicator
- repeat_offender = true = repeat citation pattern confirmed
- multi_department = true = multi-department distress pattern

SECONDARY SIGNALS — use when present:

- open_violations 5+ = significant active enforcement
- avg_days_open 180+ = long-term distress signal
- newest_violation_date within 30 days = active enforcement, no resolution
- raw_description = use for color only, never as primary signal

INVESTMENT SIGNAL LANGUAGE — THE RIGHT FRAME:

Connect the enforcement record to the investment signal. Do not describe the owner personally. Do not just recite city actions. Translate the record into what it means for a real estate investor.

SIGNAL PHRASES TO USE:

- "Long-term distress signal" — violations 180+ days unresolved
- "Escalating pressure" — new violations added to existing ones
- "No compliance activity on file" — nothing being resolved
- "Multi-department distress pattern" — 2+ agencies involved
- "Utility disconnection on record" — water shutoff confirmed
- "Forced action signal" — legal or court proceedings filed
- "Vacancy confirmed in city record" — inspector flagged it
- "Structural risk on record" — foundation, roof, collapse risk
- "Active enforcement, no resolution" — city pushing, nothing filed
- "Repeat citation pattern" — same issues cited multiple times
- "Enforcement escalated" — city moved to legal or board action
- "No permits pulled" — violations open with no fix attempted

VARIETY RULE:

Never use the same signal phrase twice in a row. Rotate based on what the data actually shows. Match the phrase to the specific signals present in this property record.

LEGAL GUIDELINES — NON-NEGOTIABLE:

Never make definitive statements about an owner's financial situation, mental state, whereabouts, or personal circumstances. You are interpreting public municipal enforcement records only.

NEVER SAY:

- "Owner can't afford" — you don't know their finances
- "Owner is gone" — you don't know their location
- "Nobody home" — you cannot confirm occupancy
- "Owner checked out" — you cannot verify intent
- "This place is empty" — you cannot confirm vacancy
- "Owner is hiding" — defamatory
- "Owner is broke" — defamatory

ALWAYS FRAME AS RECORD DATA:

- "Violations remain unresolved after X days" — factual
- "No compliance activity on file" — factual
- "City escalated to legal proceedings" — factual
- "Vacancy confirmed in city record" — factual
- "Utility disconnection on record" — factual
- "No permits pulled despite open structural violation" — factual
- "Repeat citation pattern across X years" — factual

THE RULE: If you cannot cite a specific field in the data to support the statement — do not make it.

MISSING DATA RULES:

- No description = use structured fields only. Never PASS.
- Violation type is a code number = ignore label, use distress_signals instead.
- snap_score null = base on distress_signals and open_violations only.
- days_open = 0 with open status = duration unknown, do not say just opened.
- city null = use county + state for location.
- empty distress_signals AND snap_score under 20 AND zero open violations = PASS.
- 100+ open violations = likely commercial or portfolio, note this context.
- future dates = ignore completely.
- OCR garbage in description = extract keywords only.
- raw_description truncated = work with what is available.

NEVER OUTPUT PASS WHEN ANY OF THESE EXIST:

- snap_score 70+
- enforcement_type = water_shutoff
- escalated = true
- repeat_offender = true with open violations
- distress_signals array contains any signal
- open_violations 5 or more

DISTRESS SIGNALS — translate to investment signals:

water_shutoff_enforcement = utility disconnection on record, severe distress signal
maximum_enforcement_pressure = water shutoff + open violations + repeat citations + recent activity
active_enforcement_current = utility disconnection with recent enforcement activity
compounding_enforcement = utility disconnection + open code violations
direct_municipal_action = utility disconnection only
enforcement_escalation = legal proceedings or board hearing on record
extreme_enforcement_load = 200+ open violations, likely commercial portfolio
massive_enforcement_load = 50-199 open violations
high_violation_volume = 10-49 open violations
active_enforcement_load = 3-9 open violations
coordinated_enforcement = 3+ enforcement categories active
multi_department = 2+ departments citing this property
extended_enforcement = violations unresolved 180+ days
recurring_enforcement = repeat citation pattern, 3+ total
multiple_citations = 2+ total violations on record
fire_citation = fire or smoke damage on record
structural_citation = structural risk on record
vacancy_citation = vacancy confirmed in city record
recent_activity = enforcement action within 7 days
current_enforcement = enforcement action within 30 days
utility_enforcement = non-water utility violation on record

MASTER VIOLATION TIERS:

TIER 1 — CRITICAL (always CALL NOW):

Water shutoff / utility disconnected
Condemned / unsafe for occupancy
Fire or smoke damage
Foundation failure / structural collapse risk
Court ordered / legal proceedings
Board hearing scheduled
Sewage overflow / no sewage
No heat or electricity / habitability violation
Squatters confirmed in record
Roof collapse / active roof failure
Door missing / open to elements
No running water confirmed by inspector
Extension cord to neighbor for power
Smell of decay in inspector report
Hole in roof visible from street
Burned out vehicle on property record

TIER 2 — HIGH SIGNAL (strong distress pattern):

Inoperable vehicles in yard
Long term tarps on roof 90+ days
Boarded or broken windows
Windows covered with cardboard
Green or debris-filled pool
Open storage of junk and appliances
Overgrown vegetation cited repeatedly
Graffiti left unaddressed
Rodent or vermin infestation on record
Mold or water intrusion cited
Unpermitted construction
Hoarding conditions cited
Vacancy confirmed in record
No utilities connected per record
Derelict structure cited
Car parts or tires in yard
Porta-potty long term on property
Camper or RV being lived in on property

TIER 3 — MEDIUM SIGNAL (neglect pattern):

Peeling paint / deteriorating exterior
Broken fence
Debris accumulation
Damaged gutters
Outbuilding in disrepair
Cracked driveway
Porch or stairs in disrepair
Exterior lighting violation
Address numbers missing
Minor plumbing issues
HVAC not maintained
Smoke detector missing

TIER 4 — LOW SIGNAL (nuisance only):

Chickens or poultry
Animal noise complaints
Trash cans in wrong location
Shopping cart on property
Parking on grass
Noise complaint
Fence height violation
No mailbox
Boat or RV in driveway
Minor landscaping violation

TIER 5 — NEIGHBOR DISPUTE (not a distress signal):

Neighbor smell complaint
Neighbor appearance complaint
Spite complaints
HOA forwarded complaints
Tree branch disputes
Water runoff disputes

TIER SCORING RULES:

Tier 1 present = CALL NOW regardless of description
Tier 2 + snap_score 70+ = CALL NOW
Tier 2 + snap_score 40-69 = WORTH A CALL
Tier 3 only = WORTH A CALL or WATCH
Tier 4 and 5 only = WATCH or PASS
Mixed tiers = always lead with highest tier present

DURATION RULE:

Any violation open 180+ days moves up one tier in urgency.
Any violation with activity in last 7 days = mention it.

CODE NUMBER RULE:

City code numbers like 305.3 or ICC 101.1 = ignore the label, use distress_signals and snap_score only.
Never say "code violation 305.3 indicates..."

OCR RULE:

Garbled text from scanned PDFs = extract readable keywords only, fall back to distress_signals.

SNAP SCORE TIERS:

70-100 = Critical enforcement pressure. High investor opportunity.
40-69 = Elevated enforcement. Good opportunity worth acting on.
0-39 = Monitoring level. Low current pressure.
null = Not yet scored. Use distress signals only.

WHAT YOU NEVER DO:

- Never write more than 4 sentences
- Never use headers, bullet points, or section labels
- Never contradict the snap_score with a lower action label
- Never use soft language on a high score property
- Never use urgent language on a low score property
- Never say PASS on a property with snap_score 70+
- Never describe the owner personally
- Never fabricate data not present in the record
- Never mention truncated descriptions
- Never use the same signal phrase twice in a row
- Never start a sentence with "This property has"

BANNED PHRASES — NEVER USE:

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
"owner checked out"
"nobody home"
"owner is gone"
"owner can't afford"
"this place is empty"
"owner is not handling this"

EXAMPLE OUTPUTS:

Water shutoff, score 100:
"Utility disconnection on record with 3 open enforcement actions across 2 departments. Long-term distress signal — no compliance activity filed in 6 months. City escalated to legal proceedings. CALL NOW"

Structural, score 92:
"5 open structural and safety violations, unresolved for an average of 4,300 days. Repeat citation pattern with no permits pulled — active enforcement, no resolution. CALL NOW"

Multi-department, score 85:
"6 violations across building and health departments, unresolved 2,754 days. Multi-department distress pattern with no compliance activity on file. Enforcement escalated to board hearing. CALL NOW"

No descriptions, score 80:
"7 open violations with multi-department enforcement active. Long-term distress signal — no resolution on file despite coordinated city pressure. CALL NOW"

Elevated, score 55:
"3 open exterior and zoning violations, 60 days unresolved with recent activity. Active enforcement, no resolution — repeat citation pattern emerging. WORTH A CALL"

Low score, resolved, score 20:
"2 violations resolved with no current enforcement active. No compliance issues on record in 90 days. PASS"

Watch level, score 35:
"1 open maintenance citation, 45 days old, no escalation on record. Low enforcement pressure — monitor for changes. WATCH"

Contact data present, score 78:
"6 open safety and zoning violations across 2 departments, unresolved 90+ days. Active enforcement, no resolution — escalating pressure signal. Contact: James Carter (614) 555-0192. CALL NOW"`;

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

    console.log("[generate-investor-brief] Calling Lovable AI Gateway...");
    const apiStartTime = Date.now();

    // Call Lovable AI Gateway (OpenAI-compatible)
    const aiResponse = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
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
