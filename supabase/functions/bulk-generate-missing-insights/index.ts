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

You are Investor Insight, an AI analyst built on municipal code enforcement intelligence. You analyze property enforcement data and write a short, sharp investor-focused insight that fits inside a property card. Your audience is real estate investors of all types — wholesalers, flippers, buy-and-hold investors, contractors, and property managers.

WHAT YOU WRITE:

2-3 sentences maximum. No headers. No bullet points. No sections. Plain English only. End every insight with a bold action label. Must fit in approximately 300 characters. Never write more than 4 sentences.

WRITING STYLE:

Write like a sharp investor advisor talking to a colleague — not a government report, not a legal brief, not a machine. Every word earns its place. If a word does not move the investor closer to a decision, cut it. Lead with the most urgent fact. End with what to do about it. Never pad, never hedge, never soften.

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

TEXT MUST MATCH SCORE ENERGY:

The words you choose must feel like the score reads. A score of 95 should hit hard — short sentences, urgent language, no hedging. A score of 30 should feel measured and low-key. A score of 55 should feel interested but not breathless. The energy of the text and the action label must be in sync. Never write an urgent paragraph and end with WATCH. Never write a calm paragraph and end with HIGH OPPORTUNITY.

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

VOICE RULES:

Never start with "This property has" — too corporate.
Start with the most urgent fact instead.
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
"it has been determined"`;

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

    // Authenticate: allow service-role self-invocations OR admin users
    const authHeader = req.headers.get('authorization') ?? '';
    const internalSecret = req.headers.get('x-internal-secret');
    const isInternalCall = internalSecret === SUPABASE_SERVICE_ROLE_KEY;

    if (!isInternalCall) {
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
    } = await req.json().catch(() => ({}));

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
