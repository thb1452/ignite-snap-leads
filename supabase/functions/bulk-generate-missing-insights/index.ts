/**
 * Bulk Generate Missing Insights v8.0 — Investor Brief Voice
 * 
 * Uses the same AI prompt and data enrichment as generate-investor-brief.
 * Processes properties in batches, calling Lovable AI gateway directly.
 * Writes result to snap_insight column.
 * 
 * Modes:
 *   - Default: only properties missing snap_insight
 *   - forceRefresh: overwrite existing snap_insight for score >= minScore
 *   - testMode: process specific propertyIds and return results without auto-resume
 *   - aiOnly: skip if AI credits exhausted (no fallback)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 50;
const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-2.5-flash";
const AI_MAX_TOKENS = 500;
const DELAY_BETWEEN_CALLS_MS = 200; // Small delay between individual AI calls

// Same prompt as generate-investor-brief
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

Score 70-100 → HIGH OPPORTUNITY or GOOD OPPORTUNITY only. Never WATCH or PASS.
Score 40-69 → GOOD OPPORTUNITY or WATCH only. Never HIGH OPPORTUNITY or PASS.
Score 0-39 → WATCH or PASS only. Never HIGH OPPORTUNITY or GOOD OPPORTUNITY.
Score null → Base on distress_signals. Any critical signal = GOOD OPPORTUNITY minimum.

TEXT MUST MATCH SCORE ENERGY:

Score 70-100 = Direct and urgent. Short sentences. No hedging. No softening.
Score 40-69 = Interested and measured. Worth investigating. Not breathless.
Score 0-39 = Low energy. Flat delivery. Nothing urgent to report.

Never write an urgent paragraph and end with WATCH.
Never write a calm paragraph and end with HIGH OPPORTUNITY.

OVERRIDE RULES:

- enforcement_type = 'water_shutoff' → always HIGH OPPORTUNITY
- escalated = true → always HIGH OPPORTUNITY
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

TIER 1 — CRITICAL (always HIGH OPPORTUNITY):

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

Tier 1 present = HIGH OPPORTUNITY regardless of description
Tier 2 + snap_score 70+ = HIGH OPPORTUNITY
Tier 2 + snap_score 40-69 = GOOD OPPORTUNITY
Tier 3 only = GOOD OPPORTUNITY or WATCH
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
"Utility disconnection on record with 3 open enforcement actions across 2 departments. Long-term distress signal — no compliance activity filed in 6 months. City escalated to legal proceedings. HIGH OPPORTUNITY"

Structural, score 92:
"5 open structural and safety violations, unresolved for an average of 4,300 days. Repeat citation pattern with no permits pulled — active enforcement, no resolution. HIGH OPPORTUNITY"

Multi-department, score 85:
"6 violations across building and health departments, unresolved 2,754 days. Multi-department distress pattern with no compliance activity on file. Enforcement escalated to board hearing. HIGH OPPORTUNITY"

No descriptions, score 80:
"7 open violations with multi-department enforcement active. Long-term distress signal — no resolution on file despite coordinated city pressure. HIGH OPPORTUNITY"

Elevated, score 55:
"3 open exterior and zoning violations, 60 days unresolved with recent activity. Active enforcement, no resolution — repeat citation pattern emerging. GOOD OPPORTUNITY"

Low score, resolved, score 20:
"2 violations resolved with no current enforcement active. No compliance issues on record in 90 days. PASS"

Watch level, score 35:
"1 open maintenance citation, 45 days old, no escalation on record. Low enforcement pressure — monitor for changes. WATCH"

Contact data present, score 78:
"6 open safety and zoning violations across 2 departments, unresolved 90+ days. Active enforcement, no resolution — escalating pressure signal. Contact: James Carter (614) 555-0192. HIGH OPPORTUNITY"`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required environment variables");
    }

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Authenticate: allow service-role self-invocations, test mode with specific IDs, OR admin users
    const authHeader = req.headers.get('authorization') ?? '';
    const internalSecret = req.headers.get('x-internal-secret');
    const isInternalCall = internalSecret === SUPABASE_SERVICE_ROLE_KEY;

    // Parse body early to check for testMode bypass
    const body = await req.json();
    const isTestBypass = body.testMode === true && Array.isArray(body.propertyIds) && body.propertyIds.length <= 10;

    if (!isInternalCall && !isTestBypass) {
      if (!authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const token = authHeader.replace('Bearer ', '');
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? SUPABASE_SERVICE_ROLE_KEY;
      const anonClient = createClient(SUPABASE_URL, anonKey, {
        global: { headers: { Authorization: authHeader } }
      });
      const { data: authData, error: authErr } = await anonClient.auth.getUser(token);
      if (authErr || !authData?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: roleData } = await adminClient.from('user_roles').select('role').eq('user_id', authData.user.id).eq('role', 'admin').maybeSingle();
      if (!roleData) {
        return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      console.log(`[bulk-insights-v8] Admin verified: ${authData.user.id}`);
    }

    const { 
      offset = 0, 
      dryRun = false, 
      autoResume = true, 
      forceRefresh = false, 
      minScore = 0, 
      aiOnly = true,
      testMode = false,
      propertyIds = [],
    } = body;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── TEST MODE: process specific property IDs and return results ──
    if (testMode && propertyIds.length > 0) {
      console.log(`[bulk-insights-v8] TEST MODE: processing ${propertyIds.length} specific properties`);
      const results = [];

      for (const propId of propertyIds) {
        const result = await generateInsightForProperty(supabase, propId, LOVABLE_API_KEY, false);
        results.push(result);
        if (result.status === 'credits_exhausted') break;
        await delay(DELAY_BETWEEN_CALLS_MS);
      }

      return new Response(
        JSON.stringify({
          success: true,
          testMode: true,
          results,
          elapsed_ms: Date.now() - startTime,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── PRODUCTION MODE: batch processing ──
    let countQuery = supabase.from("properties").select("id", { count: "exact", head: true });
    let fetchQuery = supabase.from("properties").select("id, snap_score");

    if (forceRefresh) {
      if (minScore > 0) {
        countQuery = countQuery.gte("snap_score", minScore);
        fetchQuery = fetchQuery.gte("snap_score", minScore);
      }
      console.log(`[bulk-insights-v8] FORCE REFRESH: score >= ${minScore || 'ALL'}`);
    } else {
      countQuery = countQuery.is("snap_insight", null);
      fetchQuery = fetchQuery.is("snap_insight", null);
    }

    const { count: totalMissing } = await countQuery;
    console.log(`[bulk-insights-v8] Starting at offset ${offset}, total: ${totalMissing}`);

    const { data: properties, error: fetchError } = await fetchQuery
      .order("snap_score", { ascending: false, nullsFirst: false })
      .order("id")
      .range(offset, offset + BATCH_SIZE - 1);

    if (fetchError) throw fetchError;

    if (!properties || properties.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "All insights generated!",
          processed: offset,
          total: totalMissing,
          complete: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[bulk-insights-v8] Processing ${properties.length} properties (offset ${offset})`);

    // Process each property individually with the investor brief prompt
    let totalProcessed = 0;
    let totalAI = 0;
    let totalSkipped = 0;
    let creditsExhausted = false;
    const errors: string[] = [];

    if (!dryRun) {
      for (const prop of properties) {
        if (creditsExhausted) break;

        const result = await generateInsightForProperty(supabase, prop.id, LOVABLE_API_KEY, true);
        
        if (result.status === 'success') {
          totalProcessed++;
          totalAI++;
        } else if (result.status === 'credits_exhausted') {
          creditsExhausted = true;
          console.log(`[bulk-insights-v8] ⚠️ AI credits exhausted at property ${prop.id}`);
        } else if (result.status === 'rate_limited') {
          // Wait longer and retry once
          console.log(`[bulk-insights-v8] Rate limited, waiting 5s...`);
          await delay(5000);
          const retry = await generateInsightForProperty(supabase, prop.id, LOVABLE_API_KEY, true);
          if (retry.status === 'success') {
            totalProcessed++;
            totalAI++;
          } else {
            totalSkipped++;
            errors.push(`${prop.id}: rate_limited after retry`);
          }
        } else {
          totalSkipped++;
          errors.push(`${prop.id}: ${result.error || result.status}`);
        }

        // Small delay between calls to avoid rate limiting
        await delay(DELAY_BETWEEN_CALLS_MS);
      }
    }

    const elapsed = Date.now() - startTime;
    const nextOffset = offset + BATCH_SIZE;
    const isComplete = nextOffset >= (totalMissing || 0);
    const progress = Math.round((nextOffset / (totalMissing || 1)) * 100);

    console.log(`[bulk-insights-v8] Batch done: ${totalProcessed} AI, ${totalSkipped} skipped in ${elapsed}ms`);
    console.log(`[bulk-insights-v8] Progress: ${Math.min(100, progress)}% (${Math.min(nextOffset, totalMissing || 0)}/${totalMissing})`);

    // Stop if credits exhausted in aiOnly mode
    if (aiOnly && creditsExhausted) {
      console.log(`[bulk-insights-v8] ⚠️ STOPPING: AI credits exhausted (aiOnly mode). Processed ${offset + totalProcessed} total.`);
      return new Response(
        JSON.stringify({
          success: true,
          processed: totalProcessed,
          ai_generated: totalAI,
          skipped: totalSkipped,
          elapsed_ms: elapsed,
          ai_credits_exhausted: true,
          stopped_reason: "AI credits exhausted. Resume later with same offset.",
          resume_offset: offset + totalProcessed,
          progress: {
            current: offset + totalProcessed,
            total: totalMissing,
            percentage: Math.round(((offset + totalProcessed) / (totalMissing || 1)) * 100),
            complete: false
          },
          errors: errors.length > 0 ? errors : undefined,
          auto_continuing: false
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Auto-continue
    const selfUrl = `${SUPABASE_URL}/functions/v1/bulk-generate-missing-insights`;
    
    if (!isComplete && !dryRun && autoResume) {
      const triggerNext = async () => {
        await delay(2000); // 2 second delay between batches
        try {
          const res = await fetch(selfUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'x-internal-secret': SUPABASE_SERVICE_ROLE_KEY,
            },
            body: JSON.stringify({ offset: nextOffset, autoResume, forceRefresh, minScore, aiOnly }),
          });
          console.log(`[bulk-insights-v8] Next batch triggered, status: ${res.status}`);
        } catch (err) {
          console.error('[bulk-insights-v8] Failed to trigger next batch:', err);
        }
      };
      // @ts-ignore
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(triggerNext());
      } else {
        triggerNext().catch(console.error);
      }
      console.log(`[bulk-insights-v8] Scheduled next batch at offset ${nextOffset}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: totalProcessed,
        ai_generated: totalAI,
        skipped: totalSkipped,
        elapsed_ms: elapsed,
        progress: {
          current: Math.min(nextOffset, totalMissing || 0),
          total: totalMissing,
          percentage: Math.min(100, progress),
          complete: isComplete
        },
        next_offset: isComplete ? null : nextOffset,
        errors: errors.length > 0 ? errors : undefined,
        auto_continuing: !isComplete && !dryRun && autoResume
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("[bulk-insights-v8] Fatal error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ── Generate insight for a single property using investor brief prompt ──
async function generateInsightForProperty(
  supabase: ReturnType<typeof createClient>,
  propertyId: string,
  apiKey: string,
  writeToDb: boolean
): Promise<{ status: string; property_id: string; snap_insight?: string; error?: string }> {
  try {
    // Fetch full property data
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
      .eq("id", propertyId)
      .maybeSingle();

    if (propError || !property) {
      return { status: 'error', property_id: propertyId, error: propError?.message || 'not_found' };
    }

    // Fetch violations
    const { data: violations } = await supabase
      .from("violations")
      .select("violation_type, status, raw_description, days_open, opened_date, case_id")
      .eq("property_id", propertyId)
      .order("opened_date", { ascending: false });

    // Fetch contacts
    const { data: contacts } = await supabase
      .from("property_contacts")
      .select("name, phone, email, source")
      .eq("property_id", propertyId);

    // Build the data block
    const userMessage = formatPropertyData(property, violations || [], contacts || []);

    // Call AI
    const aiResponse = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
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

    if (!aiResponse.ok) {
      const errText = await aiResponse.text().catch(() => 'no body');
      if (aiResponse.status === 402) {
        return { status: 'credits_exhausted', property_id: propertyId, error: 'AI credits exhausted' };
      }
      if (aiResponse.status === 429) {
        return { status: 'rate_limited', property_id: propertyId, error: 'rate limited' };
      }
      return { status: 'error', property_id: propertyId, error: `AI error ${aiResponse.status}: ${errText.slice(0, 100)}` };
    }

    const aiResult = await aiResponse.json();
    const aiText = aiResult?.choices?.[0]?.message?.content?.trim();

    if (!aiText) {
      return { status: 'error', property_id: propertyId, error: 'empty AI response' };
    }

    // Write to snap_insight
    if (writeToDb) {
      const { error: updateError } = await supabase
        .from("properties")
        .update({ snap_insight: aiText })
        .eq("id", propertyId);

      if (updateError) {
        console.error(`[bulk-insights-v8] Failed to update ${propertyId}:`, updateError);
        return { status: 'error', property_id: propertyId, snap_insight: aiText, error: `db update failed: ${updateError.message}` };
      }
    }

    console.log(`[bulk-insights-v8] ✅ ${propertyId} | score=${property.snap_score} | ${aiText.slice(0, 60)}...`);
    return { status: 'success', property_id: propertyId, snap_insight: aiText };

  } catch (err) {
    return { status: 'error', property_id: propertyId, error: err instanceof Error ? err.message : String(err) };
  }
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

  lines.push("");
  lines.push(`INDIVIDUAL VIOLATIONS (${violations.length} records):`);

  if (violations.length === 0) {
    lines.push("- No violation records on file");
  } else {
    for (const v of violations.slice(0, 20)) { // Cap at 20 violations to control token usage
      lines.push(`- Type: ${v.violation_type || "unknown"} | Status: ${v.status || "unknown"} | Days Open: ${v.days_open ?? "unknown"} | Opened: ${v.opened_date || "unknown"} | Case: ${v.case_id || "none"}`);
      if (v.raw_description) {
        lines.push(`  Description: ${v.raw_description.slice(0, 200)}`);
      }
    }
    if (violations.length > 20) {
      lines.push(`  ... and ${violations.length - 20} more violations`);
    }
  }

  lines.push("");
  lines.push("CONTACT DATA:");
  if (contacts.length > 0) {
    for (const c of contacts.slice(0, 3)) {
      lines.push(`- Name: ${c.name || "unknown"} | Phone: ${c.phone || "unknown"} | Email: ${c.email || "unknown"}`);
    }
  } else {
    lines.push("- No contact data on file");
  }

  return lines.join("\n");
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
