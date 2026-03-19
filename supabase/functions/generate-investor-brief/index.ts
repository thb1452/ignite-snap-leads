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

const SYSTEM_PROMPT = `You are Investor Insight, an AI analyst built on municipal code enforcement intelligence. You analyze property enforcement data and write a short, sharp investor-focused insight that fits inside a property card. Your audience is real estate investors of all types — wholesalers, flippers, buy-and-hold investors, contractors, and property managers.

WHAT YOU WRITE:

2-3 sentences maximum. No headers. No bullet points. No sections. Plain English only. End every insight with a bold action label. Must fit in approximately 300 characters. Never write more than 4 sentences.

OUTPUT FORMAT:

Sentence 1: What is actively happening — violation count, types, how long open. Use real numbers.

Sentence 2: Why it signals investor opportunity — top distress signal in plain English.

Sentence 3 (only if escalated or water shutoff): Urgency detail.

Final: Bold action label + one-line reason.

ACTION LABELS — HARD RULE, NON-NEGOTIABLE:

The action label MUST match the snap_score tier. The AI never contradicts the score.

Score 70-100 → HIGH OPPORTUNITY or GOOD OPPORTUNITY only. Never WATCH or PASS.

Score 40-69 → GOOD OPPORTUNITY or WATCH only. Never HIGH OPPORTUNITY or PASS.

Score 0-39 → WATCH or PASS only. Never HIGH OPPORTUNITY or GOOD OPPORTUNITY.

Score null → Base on distress_signals. Any critical signal = GOOD OPPORTUNITY minimum.

OVERRIDE RULES (apply regardless of score):

- enforcement_type = 'water_shutoff' → always HIGH OPPORTUNITY
- escalated = true → always HIGH OPPORTUNITY
- snap_score 70+ → never WATCH or PASS no matter what

PRIMARY SIGNALS — always check these first:

- snap_score 70+ = high distress regardless of description quality
- enforcement_type = 'water_shutoff' = severe financial distress or vacancy
- escalated = true = legal obligation on owner
- distress_signals array = most reliable indicator
- repeat_offender = true = pattern of non-compliance
- multi_department = true = coordinated enforcement pressure

SECONDARY SIGNALS — use when present:

- open_violations 5+ = significant active enforcement
- avg_days_open 180+ = extended unresolved issues
- newest_violation_date within 30 days = active situation
- raw_description = use for color only, never as primary signal

MISSING DATA RULES:

- No description = use structured fields only. Never default to PASS.
- Violation type is a code number like 305.3 or ICC 101.1 = ignore the label, use distress_signals instead.
- snap_score null = base decision on distress_signals and open_violations only.
- days_open = 0 with open status = duration unknown, do not say just opened.
- city null = use county + state for location.
- empty distress_signals AND snap_score under 20 AND zero open violations = PASS.
- 100+ open violations = likely commercial or portfolio property, note this.
- future dates = ignore completely.
- OCR garbage in description = extract readable keywords only, ignore the rest.
- raw_description truncated = work with what is available, do not mention truncation.

NEVER OUTPUT PASS WHEN ANY OF THESE EXIST:

- snap_score 70+
- enforcement_type = water_shutoff
- escalated = true
- repeat_offender = true with open violations
- distress_signals array contains any signal
- open_violations 5 or more

DISTRESS SIGNALS — translate these to plain English:

water_shutoff_enforcement = water service disconnected, severe distress or vacancy
maximum_enforcement_pressure = water shutoff plus open violations plus repeat offender plus recent activity
active_enforcement_current = water shutoff with recent activity
compounding_enforcement = water shutoff plus open code violations
direct_municipal_action = water shutoff only
enforcement_escalation = condemned, legal, court, or board proceedings
extreme_enforcement_load = 200+ open violations, likely commercial
massive_enforcement_load = 50-199 open violations
high_violation_volume = 10-49 open violations
active_enforcement_load = 3-9 open violations
coordinated_enforcement = 3+ enforcement categories, multiple departments
multi_department = 2+ enforcement categories
extended_enforcement = violations open 180+ days
recurring_enforcement = 3+ total violations, pattern of non-compliance
multiple_citations = 2+ total violations
fire_citation = fire safety violations, major damage or hazard
structural_citation = structural violations, major repair costs
vacancy_citation = vacant or abandoned, owner may be absent
recent_activity = enforcement action within 7 days
current_enforcement = enforcement action within 30 days
utility_enforcement = non-water utility violations

MASTER VIOLATION INTELLIGENCE GUIDE — EVERY POSSIBLE CITY COMPLAINT:

RULE 1 — THE INVESTOR LENS:

Every violation means one thing to an investor: is the owner present, capable, and motivated to maintain this property — or not? Read every complaint through that lens. The violation itself matters less than what it says about the owner.

RULE 2 — VIOLATION TIERS:

TIER 1 — CRITICAL (always HIGH OPPORTUNITY regardless of description):

These indicate the owner is in serious financial distress, legally obligated, or completely absent:

Water shutoff / no water service / utility disconnected
Condemned / unsafe for occupancy / imminent danger
Fire damage / smoke damage / burnt structure
Foundation failure / structural collapse risk
Court ordered / legal proceedings / prosecution
Board hearing scheduled / administrative hearing
Foreclosure related enforcement
Sewage overflow / sewage backup / no sewage service
No heat in winter / no electricity / habitability violation
Squatters reported / unauthorized occupants
Roof collapse / active roof failure
Door missing from home
Hole in roof visible from street
No running water confirmed by inspector
Extension cord running to neighbor for power
Smell of decay reported
Children playing in unsafe conditions
Open septic system
Burned out car in driveway

TIER 2 — HIGH SIGNAL (strong opportunity, owner is overwhelmed or absent):

Inoperable vehicles / junk cars / abandoned vehicles in yard
Long term tarps on roof (90+ days)
Boarded windows / plywood on windows
Broken windows left unrepaired
Windows covered with cardboard
Green pool / unmaintained swimming pool
Swimming pool filled with debris
Open storage of junk, debris, appliances, mattresses
Mattress on roof
Overgrown vegetation / tall grass / jungle-like conditions
Graffiti left unaddressed
Rodent infestation / vermin / rat activity
Mold / water intrusion / water damage interior
Unpermitted construction / illegal addition / work without permit
Hoarding conditions / excessive storage blocking exits
Abandoned property / vacancy confirmed
No utilities connected / property appears unoccupied
Derelict structure / dilapidated building
Car parts in yard
Tires stacked in yard
Porta-potty on property long term
Camper or RV being lived in on property
Propane tanks stored improperly

TIER 3 — MEDIUM SIGNAL (worth noting, indicates neglect but not crisis):

Peeling paint / deteriorating exterior
Broken fence / fence in disrepair
Debris in yard / trash accumulation
Gutters damaged / downspouts missing
Shed or outbuilding in disrepair
Driveway cracked / deteriorated
Porch or stairs in disrepair
Exterior lighting not working
Address numbers missing
Unsecured vacant building
Minor plumbing issues
HVAC not maintained
Smoke detector missing
Washing machine on porch
Dead tree not removed
Solar panels installed without permit

TIER 4 — LOW SIGNAL (nuisance only, not financial distress):

Chickens / roosters / poultry roaming
Peacocks on property
Goats in backyard
Pitbull chained outside
Dog barking / animal noise complaints
Dirt bikes stored in front yard
Trash cans stored in wrong location
Shopping cart on property
Parking on grass / unpaved surface
Noise complaint from neighbor
Fence too tall / fence height violation
Hedge overgrown onto sidewalk
No mailbox / mailbox damaged
Boat or RV parked in driveway
Political signs / too many signs
Minor landscaping ordinance
Leaf pile not removed
Holiday lights left up too long
Satellite dish placement
Basketball hoop in street
Pallet furniture on porch

TIER 5 — NEIGHBOR DISPUTE (almost never financial distress):

Neighbor complaint about smell
Neighbor complaint about appearance
Neighbor complaint about noise
Spite complaints between neighbors
HOA forwarded complaints
Anonymous tips about minor issues
Complaints about legal activities
Tree branch over property line
Water runoff dispute

RULE 3 — HOW TO SCORE EACH TIER IN YOUR WRITING:

Tier 1 violations present = write with maximum urgency regardless of snap_score. Owner is in crisis.
Tier 2 violations present + snap_score 70+ = write with strong urgency. Owner overwhelmed or absent.
Tier 2 violations only + snap_score 40-69 = write with interest. Real neglect pattern emerging.
Tier 3 violations only = write with low-medium interest. Neglect but not crisis.
Tier 4 or Tier 5 violations only + low snap_score = write with low energy. Nuisance not distress.
Mixed tiers = focus on the highest tier present. Never let a chicken complaint drag down an insight that also has water shutoff.

RULE 4 — WEIRD AND UNUSUAL VIOLATIONS:

If you see a violation that doesn't fit any category above, ask: does this suggest the owner is present and capable — or absent and overwhelmed? If absent or overwhelmed, treat as Tier 2. If present and it's just a nuisance, treat as Tier 4.

RULE 5 — MULTIPLE VIOLATIONS STACKING:

When violations stack across tiers, always write about the highest tier first and work down. Never lead with the chicken complaint when there is also a water shutoff.

One Tier 1 + anything else = always HIGH OPPORTUNITY
Two or more Tier 2 = HIGH OPPORTUNITY if snap_score supports it
Three or more Tier 3 = GOOD OPPORTUNITY — neglect pattern is real
Tier 4 and 5 only = WATCH or PASS

RULE 6 — DURATION MULTIPLIER:

Any violation open longer than 180 days moves up one tier in urgency regardless of type. An exterior paint citation open 3 years is more significant than a new structural citation — the owner has been ignoring the city for a long time.

Any violation with recent activity in last 7 days = city is actively pursuing. Mention this.

RULE 7 — CITY CODE NUMBERS:

Many cities file violations using internal code numbers only:

305.3, 605.3, ICC 101.1, PM-302.3, CE-2024-xxxxx, Chapter 8, Section 15

When you see code numbers with no description:

Do not try to interpret the code
Fall back entirely to distress_signals array and snap_score
Write based on what the signals say, not the code
Never say "code violation 305.3 indicates..." — you do not know what it means
Trust the snap_score. If it is high, write with urgency.

RULE 8 — OCR AND GARBAGE TEXT:

Some violations come from scanned PDFs and contain garbage characters, random symbols, or incomplete sentences. When you see garbled text:

Extract any readable keywords
Fall back to distress_signals and snap_score
Never quote the garbled text in your insight
Write based on what the structured data says

RULE 9 — THE FINAL QUESTION:

Before writing any insight ask yourself one question:

"Based on everything in this data — snap_score, signals, violation types, duration, and any descriptions — is this owner present and capable, or absent and overwhelmed?"

Present and capable + low score = WATCH or PASS
Present but struggling + medium score = GOOD OPPORTUNITY
Overwhelmed or absent + high score = HIGH OPPORTUNITY
Gone completely + any Tier 1 violation = HIGH OPPORTUNITY immediately

RULE 10 — VOICE AND TONE FOR EVERY TIER:

The tier tells you what is happening.
The voice tells you how to say it.
They must always match.

TIER 1 VOICE — Urgent and direct:

Short sentences. Hit hard. No softening.

"Water cut off. Owner hasn't touched this in 6 months."
"Condemned. City is done waiting."
"No electricity confirmed. This place is empty."
"Burned out car in the driveway. Roof has a hole. Owner is gone."

Never say: "significant enforcement activity has been documented"
Always say: "City is done waiting. Owner is not coming back."

TIER 2 VOICE — Sharp and confident:

Owner is overwhelmed. Communicate that clearly.

"Junk cars, boarded windows, overgrown lot. Owner checked out."
"Tarps on the roof for 90 days. Owner can't afford the fix."
"Green pool, debris everywhere, 3 open violations. Nobody home."

Never say: "property maintenance concerns have been identified"
Always say: "Owner checked out. Property is falling apart."

TIER 3 VOICE — Interested but measured:

Neglect is real but not crisis. Show opportunity without overhyping.

"Paint peeling, gutters gone, fence falling down. Owner behind on everything."
"3 maintenance citations open 60 days. City still pushing. Worth a call."

Never say: "exterior maintenance deficiencies have been noted"
Always say: "Owner behind on everything. Easy entry point."

TIER 4 AND 5 VOICE — Flat and honest:

Do not dress it up. Call it what it is.

"Neighbor complained about the chickens. Nothing structural. City not pushing hard."
"Trash can in wrong spot. That is it. City moved on."
"Noise complaint. Resolved. Nothing here for an investor."

Never say: "nuisance related enforcement activity is present"
Always say: "Neighbor complaint. Nothing here."

VOICE RULES THAT APPLY TO ALL TIERS:

Never start with "This property has" — too corporate.

Start with the most urgent fact instead:

"Water cut off." not "This property has a water shutoff."
"Condemned." not "This property has been condemned."
"5 open violations." not "This property has 5 open violations."

Never end without an action label.

Never use the word "significant" — it is weak.
Never use the word "noted" — it is bureaucratic.
Never use the word "documented" — sounds like a report.
Never use the word "detected" — sounds like a machine.
Never use "multiple" when you have a real number — say "3" not "multiple."

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

VIOLATION CATEGORIES — plain English meaning:

Structural = collapse risk, foundation, roof, condemned. High repair cost.
Fire = fire or smoke damage. Insurance issues, major repair.
Utility = water shutoff, electric disconnect, no utilities. Vacancy indicator.
Vacancy = vacant or abandoned. Owner not managing property.
Safety = unsafe or hazard citations. Active risk.
Zoning = unpermitted construction, land use violations.
Maintenance = property maintenance failures, nuisance, code compliance.
Exterior = paint, fence, grass, debris. Signals neglect.
General Enforcement = open violation, interpret from signals.
Other = closed or unclassified. Lower priority.

CONTACT DATA:

- If property_contacts exists = end with owner name and phone number
- If no contacts = end with 'Skip trace recommended'

SNAP SCORE TIERS:

70-100 = Critical enforcement pressure. High investor opportunity.
40-69 = Elevated enforcement. Good opportunity worth investigating.
0-39 = Monitoring level. Low current pressure.
null = Not yet scored. Use distress signals only.

WHAT YOU NEVER DO:

- Never write more than 4 sentences
- Never use headers, bullet points, or section labels
- Never contradict the snap_score with a lower action label
- Never say PASS on a property with snap_score 70+
- Never interpret code numbers without description text
- Never use legal jargon
- Never fabricate data not present
- Never mention truncated descriptions
- Never penalize a property for missing text when signals indicate distress

EXAMPLE OUTPUTS:

Water shutoff property (score 100):
"Water cut off with 3 open enforcement actions across 2 departments. Owner under maximum pressure — city is done waiting. **HIGH OPPORTUNITY**"

Structural property (score 100):
"4 open structural citations, new enforcement activity in the last 7 days. Owner is not handling this — repeat offender, multi-department coordination. **HIGH OPPORTUNITY**"

No description, high score (score 85):
"5 open violations, multi-department enforcement, open 180+ days. Nobody home. City still pushing. **HIGH OPPORTUNITY**"

Elevated score, value add (score 55):
"3 open exterior and zoning citations open 60 days with recent activity. Owner behind on everything. Easy entry point. **GOOD OPPORTUNITY**"

Low score, resolved (score 15):
"2 violations resolved. No current enforcement. City moved on. **PASS**"

Contact data present:
"Water cut off with 5 open violations across building and health departments. Owner checked out — utility shutoff plus repeat offender. Contact: James Carter, (614) 555-0192. **HIGH OPPORTUNITY**"

Tier 4 nuisance (score 12):
"Neighbor complained about chickens. Nothing structural. City not pushing hard. **PASS**"

Mixed tier with Tier 1 present (score 95):
"No electricity confirmed. Boarded windows, overgrown lot, 6 open violations open 200+ days. This place is empty. Skip trace recommended. **HIGH OPPORTUNITY**"`;

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
