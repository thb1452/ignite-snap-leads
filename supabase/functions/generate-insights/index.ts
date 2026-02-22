 /**
  * SNAP INSIGHT GENERATION v4.0 - HYBRID AI + DETERMINISTIC ENGINE
  * 
  * Properties with snap_score >= 50: AI-generated enforcement-pressure insight
  *   - Uses Lovable AI (Gemini Flash) via gateway
  *   - Strict enforcement-neutral framing (NO investor/acquisition language)
  *   - Falls back to deterministic engine if AI credits exhausted or error
  * 
  * Properties with snap_score < 50 (or AI unavailable): deterministic rule-based engine v3.0
  * 
  * Build Brief Compliance:
  * - Raw city notes stored in violations.raw_description (INTERNAL)
  * - Composed summaries stored in properties.snap_insight (PUBLIC)
  * - NO raw violation details ever displayed to users
  */
 import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const VERSION = "v5.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-2.5-flash-lite"; // Fast + cheap for batch processing
const SNAP_SCORE_AI_THRESHOLD = 50; // Only use AI for properties >= this score

interface Violation {
  id: string;
  violation_type: string;
  status: string;
  days_open: number | null;
  opened_date: string | null;
  raw_description: string | null;
  last_updated: string | null;
}

interface ViolationWithPriority {
  category: string;
  priority: 'high' | 'medium' | 'low';
  original: Violation;
}

interface SnapScoreResult {
  score: number;
  signals: string[];
  activityClass: 'critical' | 'elevated' | 'monitoring';
}

interface PropertyIntelligence {
  total_violations: number;
  open_violations: number;
  oldest_violation_date: string | null;
  newest_violation_date: string | null;
  avg_days_open: number;
  violation_types: string[];
  repeat_offender: boolean;
  multi_department: boolean;
  escalated: boolean;
}

// ============================================================================
// DETERMINISTIC INSIGHT BLOCKS (v3.0 - fallback / low score)
// ============================================================================
const INSIGHT_BLOCKS = {
  SCOPE_MULTI_CATEGORY: "Property is subject to enforcement actions across multiple municipal categories.",
  SCOPE_MULTI_VIOLATION: "Multiple code violations documented at this address.",
  DURATION_EXTENDED_180: "Several violations have remained open for an extended period exceeding 180 days.",
  DURATION_EXTENDED_90: "Open enforcement matters have persisted beyond the standard 90-day resolution period.",
  DURATION_EXTENDED_60: "Active citations remain unresolved past 60 days.",
  RECENT_7_DAYS: "Recent inspection activity indicates continued municipal oversight.",
  RECENT_30_DAYS: "Enforcement records updated within the past 30 days.",
  PRIORITY_UTILITY: "Records include utility service enforcement notices.",
  PRIORITY_WATER_SHUTOFF: "Municipal water service disconnected — direct enforcement action taken by the utility authority. This represents a formal, process-driven municipal action beyond standard notice issuance.",
  PRIORITY_WATER_SHUTOFF_WITH_VIOLATIONS: "Water service disconnected with concurrent open code violations — multiple enforcement bodies actively engaged at this address.",
  PRIORITY_WATER_SHUTOFF_RECENT: "Water disconnection executed within the last 30 days — active municipal oversight currently in effect.",
  PRIORITY_WATER_SHUTOFF_COMPOUND: "Maximum enforcement pressure: water disconnection combined with multiple open violations and recent activity. Coordinated multi-agency enforcement documented.",
  PRIORITY_CONDEMNATION: "Condemnation or unsafe structure orders documented.",
  PRIORITY_LEGAL: "Case has been referred for legal enforcement action.",
  PRIORITY_FIRE_MARSHAL: "Fire marshal orders or fire safety citations on file.",
  CATEGORY_STRUCTURAL: "Structural integrity citations documented in inspection records.",
  CATEGORY_FIRE: "Fire safety violations recorded by municipal inspectors.",
  CATEGORY_VACANCY: "Vacancy or property abandonment citations on file.",
  CATEGORY_SAFETY: "Safety hazard violations documented.",
  CATEGORY_EXTERIOR: "Exterior maintenance and property upkeep violations noted.",
  ESCALATION_BOARD: "Case scheduled for municipal board hearing.",
  ESCALATION_COURT: "Enforcement matter referred to municipal court.",
  ESCALATION_PROSECUTION: "Case under prosecution review.",
  PATTERN_REPEAT: "Property shows recurring enforcement activity pattern.",
  PATTERN_MULTI_DEPT: "Cross-departmental enforcement coordination documented.",
} as const;

// ============================================================================
// AI INSIGHT GENERATION
// Produces enforcement-pressure summaries; NO investor language allowed
// ============================================================================
async function generateAIInsight(
  property: { address: string; city: string },
  violations: Violation[],
  classified: ViolationWithPriority[],
  intelligence: PropertyIntelligence,
  scoreResult: SnapScoreResult,
  apiKey: string
): Promise<string | null> {
  try {
    const openViolations = violations.filter(v => (v.status || '').toLowerCase().trim() === 'open');
    const categories = [...new Set(classified.map(v => v.category))].join(', ');
    const highPriority = classified.filter(v => v.priority === 'high').map(v => v.category);
    const escalated = intelligence.escalated;
    const avgDays = intelligence.avg_days_open;
    const openCount = intelligence.open_violations;
    const totalCount = intelligence.total_violations;

    const violationSummary = violations.slice(0, 8).map(v =>
      `- Type: ${v.violation_type || 'Unknown'} | Status: ${v.status || 'Unknown'} | Days open: ${v.days_open ?? 'N/A'}`
    ).join('\n');

    const systemPrompt = `You are a municipal enforcement data analyst. Your job is to write concise, factual, enforcement-pressure summaries for code compliance records.

STRICT RULES:
1. Write from the perspective of a neutral municipal enforcement data analyst — NOT a real estate investor.
2. NEVER use words like: investor, acquisition, opportunity, distress, motivated, deal, profit, upside, buy, purchase, wholesale, flip, value-add, discounted, negotiation leverage, below market, negotiate, motivated seller, financial hardship, financial distress.
3. Focus ONLY on: what enforcement actions municipalities have taken, how recent they are, and what that signals about ongoing oversight activity. Frame water shutoffs as ACTIVE MUNICIPAL ENFORCEMENT ACTIONS (formal process-driven disconnections), NOT as financial distress signals.
4. Keep the summary to 1–3 sentences, max 260 characters.
5. Write in third-person, factual, neutral tone.
6. Example of GOOD output: "Water service disconnected by municipal authority — a formal enforcement action requiring administrative process. Concurrent open code violations indicate coordinated multi-agency oversight."
7. Example of BAD output: "This distressed property shows signs of financial hardship with utility disconnection."`;

    const userPrompt = `Write an enforcement-pressure insight for this property:

Address: ${property.address}, ${property.city}
Snap Score: ${scoreResult.score}/100
Open violations: ${openCount} of ${totalCount} total
Enforcement categories: ${categories}
${highPriority.length > 0 ? `High-priority categories: ${highPriority.join(', ')}` : ''}
Average days open: ${avgDays}
Escalated: ${escalated ? 'Yes' : 'No'}
Enforcement signals: ${scoreResult.signals.join(', ') || 'none'}

Violations:
${violationSummary}

Write only the insight text (no labels, no preamble):`;

    const response = await fetch(AI_GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 120,
        temperature: 0.3,
      }),
    });

    if (response.status === 429 || response.status === 402) {
      // Rate limited or out of credits — signal to caller to stop AI for this batch
      console.warn(`[generate-insights ${VERSION}] AI unavailable (${response.status}), falling back to deterministic`);
      return null; // null = fallback
    }

    if (!response.ok) {
      console.error(`[generate-insights ${VERSION}] AI gateway error ${response.status}`);
      return null;
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content?.trim();

    if (!text || text.length < 10) return null;

    // Truncate to 280 chars max
    return text.length > 280 ? text.substring(0, 277) + '...' : text;
  } catch (err) {
    console.error(`[generate-insights ${VERSION}] AI error:`, err);
    return null;
  }
}

serve(async (req) => {
  console.log(`[generate-insights ${VERSION}] Request received`);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { propertyIds } = await req.json();
    
    if (!propertyIds || !Array.isArray(propertyIds) || propertyIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "propertyIds array is required" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required environment variables");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch properties with their violations
    const { data: properties, error: fetchError } = await supabase
      .from("properties")
      .select(`
        id,
        address,
        city,
        snap_score,
        jurisdiction_id,
        enforcement_type,
        violations (
          id,
          violation_type,
          status,
          days_open,
          opened_date,
          raw_description,
          last_updated
        )
      `)
      .in("id", propertyIds);

    if (fetchError) {
      console.error(`[generate-insights ${VERSION}] Error fetching properties:`, fetchError);
      throw fetchError;
    }

    if (!properties || properties.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          processed: 0, 
          total: propertyIds.length,
          message: "No properties found to process",
          _version: VERSION
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[generate-insights ${VERSION}] Processing ${properties.length} properties (AI threshold: score >= ${SNAP_SCORE_AI_THRESHOLD})`);

    const updates = [];
    let successCount = 0;
    let errorCount = 0;
    let aiGeneratedCount = 0;
    let deterministicCount = 0;
    let aiCreditsExhausted = false; // Once true, skip AI for rest of batch

    // Process each property
    for (const property of properties) {
      const violations = (property.violations || []) as Violation[];
      
      // Tag violations array with property-level enforcement_type for water shutoff detection
      if ((property as any).enforcement_type === 'water_shutoff') {
        (violations as any).__enforcement_type = 'water_shutoff';
      }
      
      // Aggregate property intelligence
      const intelligence = aggregatePropertyIntelligence(violations);
      
      // Classify violations with enforcement priority
      const classifiedViolations = violations.map(v => classifyViolation(v));
      
      // Calculate enforcement intensity score with signals
      const scoreResult = calculateEnforcementIntensity(violations, classifiedViolations, intelligence);

      let snapInsight: string;
      let method: 'ai' | 'deterministic' = 'deterministic';

      // Attempt AI insight for high-pressure properties if credits available
      const existingScore = property.snap_score ?? scoreResult.score;
      const shouldUseAI = LOVABLE_API_KEY && 
                          !aiCreditsExhausted && 
                          scoreResult.score >= SNAP_SCORE_AI_THRESHOLD;

      if (shouldUseAI) {
        const aiInsight = await generateAIInsight(
          { address: property.address, city: property.city },
          violations,
          classifiedViolations,
          intelligence,
          scoreResult,
          LOVABLE_API_KEY!
        );

        if (aiInsight === null) {
          // null means rate-limited or out of credits — disable AI for this batch
          aiCreditsExhausted = true;
          snapInsight = composeEnforcementInsight(scoreResult.signals, intelligence, classifiedViolations);
          deterministicCount++;
        } else {
          snapInsight = aiInsight;
          aiGeneratedCount++;
          method = 'ai';
        }
      } else {
        snapInsight = composeEnforcementInsight(scoreResult.signals, intelligence, classifiedViolations);
        deterministicCount++;
      }

      // Map activityClass to legacy opportunityClass for database compatibility
      const opportunityClass = scoreResult.activityClass === 'critical' ? 'distressed' :
                               scoreResult.activityClass === 'elevated' ? 'value_add' : 'watch';

      updates.push({
        id: property.id,
        snap_insight: snapInsight,
        snap_score: scoreResult.score,
        total_violations: intelligence.total_violations,
        open_violations: intelligence.open_violations,
        oldest_violation_date: intelligence.oldest_violation_date,
        newest_violation_date: intelligence.newest_violation_date,
        avg_days_open: intelligence.avg_days_open,
        violation_types: intelligence.violation_types,
        repeat_offender: intelligence.repeat_offender,
        multi_department: intelligence.multi_department,
        escalated: intelligence.escalated,
        distress_signals: scoreResult.signals,
        opportunity_class: opportunityClass,
        last_analyzed_at: new Date().toISOString(),
      });
    }

    // Batch update all properties
    for (const update of updates) {
      const { error: updateError } = await supabase
        .from("properties")
        .update({
          snap_insight: update.snap_insight,
          snap_score: update.snap_score,
          total_violations: update.total_violations,
          open_violations: update.open_violations,
          oldest_violation_date: update.oldest_violation_date,
          newest_violation_date: update.newest_violation_date,
          avg_days_open: update.avg_days_open,
          violation_types: update.violation_types,
          repeat_offender: update.repeat_offender,
          multi_department: update.multi_department,
          escalated: update.escalated,
          distress_signals: update.distress_signals,
          opportunity_class: update.opportunity_class,
          last_analyzed_at: update.last_analyzed_at,
        })
        .eq("id", update.id);

      if (updateError) {
        console.error(`[generate-insights ${VERSION}] Error updating ${update.id}:`, updateError);
        errorCount++;
      } else {
        successCount++;
      }
    }

    console.log(`[generate-insights ${VERSION}] =====================================================`);
    console.log(`[generate-insights ${VERSION}] Insight Generation Complete (${VERSION})`);
    console.log(`[generate-insights ${VERSION}]   ✓ Success: ${successCount} properties`);
    console.log(`[generate-insights ${VERSION}]   ✗ Errors: ${errorCount} properties`);
    console.log(`[generate-insights ${VERSION}]   🤖 AI-generated: ${aiGeneratedCount} (score >= ${SNAP_SCORE_AI_THRESHOLD})`);
    console.log(`[generate-insights ${VERSION}]   📋 Deterministic: ${deterministicCount}`);
    if (aiCreditsExhausted) {
      console.log(`[generate-insights ${VERSION}]   ⚠️  AI credits exhausted mid-batch, fell back to deterministic`);
    }
    console.log(`[generate-insights ${VERSION}] =====================================================`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: successCount,
        errors: errorCount,
        total: propertyIds.length,
        breakdown: {
          ai_generated: aiGeneratedCount,
          rule_based: deterministicCount,
          ai_credits_exhausted: aiCreditsExhausted,
        },
        method: aiGeneratedCount > 0 ? 'hybrid' : 'deterministic_rule_based',
        _version: VERSION,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`[generate-insights ${VERSION}] Fatal error:`, error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        _version: VERSION 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================================
// PROPERTY INTELLIGENCE AGGREGATION
// ============================================================================
function aggregatePropertyIntelligence(violations: Violation[]): PropertyIntelligence {
  const escalatedStatuses = ['board', 'legal', 'court', 'condemned', 'prosecution'];
  
  const openViolations = violations.filter(v => {
    const status = (v.status || '').toLowerCase().trim();
    return status === 'open';
  });
  
  const dates = violations
    .map(v => v.opened_date)
    .filter(d => d)
    .map(d => new Date(d!))
    .sort((a, b) => a.getTime() - b.getTime());
  
  const daysOpen = violations.map(v => v.days_open || 0);
  const avgDays = daysOpen.length > 0 
    ? Math.round(daysOpen.reduce((a, b) => a + b, 0) / daysOpen.length) 
    : 0;
  
  const violationTypes = [...new Set(violations.map(v => v.violation_type).filter(Boolean))];
  
  const hasEscalation = violations.some(v => {
    const status = (v.status || '').toLowerCase();
    return escalatedStatuses.some(s => status.includes(s));
  });
  
  return {
    total_violations: violations.length,
    open_violations: openViolations.length,
    oldest_violation_date: dates.length > 0 ? dates[0].toISOString().split('T')[0] : null,
    newest_violation_date: dates.length > 0 ? dates[dates.length - 1].toISOString().split('T')[0] : null,
    avg_days_open: avgDays,
    violation_types: violationTypes,
    repeat_offender: violations.length >= 3,
    multi_department: violationTypes.length >= 2,
    escalated: hasEscalation,
  };
}

// ============================================================================
// ENFORCEMENT INTENSITY SCORING
// ============================================================================
function calculateEnforcementIntensity(
  violations: Violation[],
  classified: ViolationWithPriority[],
  intelligence: PropertyIntelligence
): SnapScoreResult {
  let score = 0;
  const signals: string[] = [];
  
  const openViolations = violations.filter(v => 
    (v.status || '').toLowerCase().trim() === 'open'
  );
  const openClassified = classified.filter(c => 
    (c.original.status || '').toLowerCase().trim() === 'open'
  );
  
  // Duration Factor
  const maxDaysOpen = openViolations.length > 0 
    ? Math.max(...openViolations.map(v => v.days_open || 0), 0)
    : 0;
  const monthsOpen = Math.floor(maxDaysOpen / 30);
  score += Math.min(30, monthsOpen * 3);
  
  if (maxDaysOpen > 180) signals.push('extended_enforcement');
  
  // Priority Matrix
  const highPriorityCount = openClassified.filter(v => v.priority === 'high').length;
  const mediumPriorityCount = openClassified.filter(v => v.priority === 'medium').length;
  
  if (highPriorityCount > 0) {
    score += 40 + Math.min((highPriorityCount - 1) * 10, 20);
    if (openClassified.some(v => v.priority === 'high' && v.category === 'Fire')) 
      signals.push('fire_citation');
    if (openClassified.some(v => v.priority === 'high' && v.category === 'Structural')) 
      signals.push('structural_citation');
  }
  score += Math.min(mediumPriorityCount * 15, 30);
  
  // Repeat Activity
  if (intelligence.repeat_offender) {
    if (violations.length >= 5) {
      score += 25;
      signals.push('recurring_enforcement');
    } else if (violations.length >= 3) {
      score += 15;
      signals.push('multiple_citations');
    }
  } else if (violations.length >= 2) {
    score += 5;
    signals.push('multiple_citations');
  }
  
  // Multi-Agency
  const openCategories = [...new Set(openClassified.map(v => v.category))];
  if (openCategories.length >= 3) {
    score += 25;
    signals.push('coordinated_enforcement');
  } else if (openCategories.length >= 2) {
    score += 15;
    signals.push('multi_department');
  }
  
  // Escalation
  if (intelligence.escalated) {
    const statuses = openViolations.map(v => (v.status || '').toLowerCase());
    if (statuses.some(s => s.includes('condemned') || s.includes('prosecution'))) {
      score += 30;
      signals.push('enforcement_escalation');
    } else if (statuses.some(s => s.includes('legal') || s.includes('court'))) {
      score += 25;
      signals.push('enforcement_escalation');
    } else if (statuses.some(s => s.includes('board') || s.includes('hearing'))) {
      score += 15;
      signals.push('enforcement_escalation');
    }
  }
  
  // Vacancy Indicators
  const hasVacancySignals = openClassified.some(v => 
    v.category === 'Vacancy' ||
    (v.original.violation_type || '').toLowerCase().includes('vacant') ||
    (v.original.violation_type || '').toLowerCase().includes('abandon')
  );
  if (hasVacancySignals) {
    score += 25;
    signals.push('vacancy_citation');
  }
  
  // Recency (calculated early for water shutoff tiering)
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  const hasRecent7 = violations.some(v => {
    const d = v.opened_date ? new Date(v.opened_date) : v.last_updated ? new Date(v.last_updated) : null;
    return d && d >= sevenDaysAgo;
  });
  const hasRecent30 = !hasRecent7 && violations.some(v => {
    const d = v.opened_date ? new Date(v.opened_date) : v.last_updated ? new Date(v.last_updated) : null;
    return d && d >= thirtyDaysAgo;
  });
  
  if (hasRecent7) {
    score += 40;
    signals.push('recent_activity');
  } else if (hasRecent30) {
    score += 20;
    signals.push('current_enforcement');
  }

  // ── Water Shutoff Enforcement Scoring (tiered) ──
  // Water shutoff = direct municipal action, not just a notice
  // Check property-level enforcement_type tag first (set during upload),
  // then fall back to violation text scanning
  const hasWaterShutoff = (violations as any).__enforcement_type === 'water_shutoff' ||
    classified.some(v => {
      const combined = `${(v.original.violation_type || '').toLowerCase()} ${(v.original.raw_description || '').toLowerCase()}`;
      return combined.includes('water shutoff') || combined.includes('water disconnect') ||
             combined.includes('no water') || combined.includes('water termination') ||
             combined.includes('water service disconnect');
    });
  
  const hasOpenCodeViolations = openClassified.filter(v => v.category !== 'Utility').length > 0;
  
  if (hasWaterShutoff) {
    signals.push('water_shutoff_enforcement');
    
    if (hasOpenCodeViolations && intelligence.repeat_offender && (hasRecent7 || hasRecent30)) {
      // Water shutoff + multiple violations + recent → 85-100 (maximum enforcement pressure)
      score += 55;
      signals.push('maximum_enforcement_pressure');
    } else if (hasRecent7 || hasRecent30) {
      // Water shutoff + recent activity (last 30 days) → 75-85
      score += 48;
      signals.push('active_enforcement_current');
    } else if (hasOpenCodeViolations) {
      // Water shutoff + open code violations → 65-75
      score += 42;
      signals.push('compounding_enforcement');
    } else {
      // Water shutoff alone → 40-50 base points
      score += 40;
      signals.push('direct_municipal_action');
    }
  }

  // Utility Enforcement (non-water-shutoff)
  if (!hasWaterShutoff && openClassified.some(v => v.category === 'Utility')) {
    signals.push('utility_enforcement');
  }
  
  // Cap score if all violations resolved
  if (openViolations.length === 0 && violations.length > 0) {
    score = Math.min(score, 20);
  }
  
  const finalScore = Math.min(100, Math.max(0, score));
  
  let activityClass: 'critical' | 'elevated' | 'monitoring' = 'monitoring';
  if (finalScore >= 70) activityClass = 'critical';
  else if (finalScore >= 40) activityClass = 'elevated';
  
  return { score: finalScore, signals, activityClass };
}

// ============================================================================
// VIOLATION CLASSIFICATION
// ============================================================================
function classifyViolation(violation: Violation): ViolationWithPriority {
  const t = (violation.violation_type || '').toLowerCase();
  const desc = (violation.raw_description || '').toLowerCase();
  const combined = `${t} ${desc}`;
  
  // HIGH PRIORITY
  if (combined.includes('collapse') || combined.includes('unsafe structure') || 
      combined.includes('condemned') || combined.includes('foundation failure') ||
      combined.includes('imminent danger')) {
    return { category: 'Structural', priority: 'high', original: violation };
  }
  
  if (combined.includes('fire damage') || combined.includes('burnt') || 
      combined.includes('smoke damage') || combined.includes('charred')) {
    return { category: 'Fire', priority: 'high', original: violation };
  }
  
  if (combined.includes('no utilities') || combined.includes('utility disconnect') ||
      combined.includes('no water') || combined.includes('no electric') ||
      combined.includes('water disconnect') || combined.includes('water shutoff')) {
    return { category: 'Utility', priority: 'high', original: violation };
  }
  
  // MEDIUM PRIORITY
  if (combined.includes('roof leak') || combined.includes('structural damage') ||
      combined.includes('foundation crack') || combined.includes('major repair')) {
    return { category: 'Structural', priority: 'medium', original: violation };
  }
  
  if (combined.includes('vacant') || combined.includes('abandon') || 
      combined.includes('unoccup') || combined.includes('boarded')) {
    return { category: 'Vacancy', priority: 'medium', original: violation };
  }
  
  if (combined.includes('unsafe') || combined.includes('hazard') || 
      combined.includes('danger') || combined.includes('health')) {
    return { category: 'Safety', priority: 'medium', original: violation };
  }
  
  if (combined.includes('plumbing') || combined.includes('electrical') ||
      combined.includes('sewage') || combined.includes('hvac')) {
    return { category: 'Utility', priority: 'medium', original: violation };
  }
  
  // LOW PRIORITY
  if (combined.includes('paint') || combined.includes('siding') || 
      combined.includes('fence') || combined.includes('grass') ||
      combined.includes('weeds') || combined.includes('debris')) {
    return { category: 'Exterior', priority: 'low', original: violation };
  }
  
  if (combined.includes('window') || combined.includes('door') ||
      combined.includes('screen') || combined.includes('gutter')) {
    return { category: 'Exterior', priority: 'low', original: violation };
  }
  
  // Defaults
  if (combined.includes('structur') || combined.includes('foundation') || 
      combined.includes('roof') || combined.includes('wall')) {
    return { category: 'Structural', priority: 'medium', original: violation };
  }
  
  if (combined.includes('fire') || combined.includes('burn') || combined.includes('smoke')) {
    return { category: 'Fire', priority: 'high', original: violation };
  }
  
  if (combined.includes('exterior') || combined.includes('facade')) {
    return { category: 'Exterior', priority: 'low', original: violation };
  }
  
  return { category: 'Other', priority: 'low', original: violation };
}

// ============================================================================
// v3.0 DETERMINISTIC INSIGHT COMPOSITION ENGINE (fallback / low score)
// ============================================================================
function composeEnforcementInsight(
  signals: string[],
  intelligence: PropertyIntelligence,
  classified: ViolationWithPriority[]
): string {
  const parts: string[] = [];
  
  // Block A - Enforcement Scope
  const uniqueCategories = [...new Set(classified.map(v => v.category))];
  if (uniqueCategories.length >= 3) {
    parts.push(INSIGHT_BLOCKS.SCOPE_MULTI_CATEGORY);
  } else if (intelligence.open_violations >= 2 || uniqueCategories.length >= 2) {
    parts.push(INSIGHT_BLOCKS.SCOPE_MULTI_VIOLATION);
  }
  
  // Block B - Duration
  const maxDaysOpen = classified.length > 0 
    ? Math.max(...classified.map(v => v.original.days_open || 0), 0)
    : 0;
  
  if (maxDaysOpen >= 180 || signals.includes('extended_enforcement')) {
    parts.push(INSIGHT_BLOCKS.DURATION_EXTENDED_180);
  } else if (maxDaysOpen >= 90 || intelligence.avg_days_open >= 90) {
    parts.push(INSIGHT_BLOCKS.DURATION_EXTENDED_90);
  } else if (maxDaysOpen >= 60 || intelligence.avg_days_open >= 60) {
    parts.push(INSIGHT_BLOCKS.DURATION_EXTENDED_60);
  }
  
  // Block C - Recent Activity
  if (signals.includes('recent_activity')) {
    parts.push(INSIGHT_BLOCKS.RECENT_7_DAYS);
  } else if (signals.includes('current_enforcement')) {
    parts.push(INSIGHT_BLOCKS.RECENT_30_DAYS);
  }
  
  // Block D - Priority Enforcement (Water Shutoff takes precedence)
  if (signals.includes('water_shutoff_enforcement')) {
    if (signals.includes('maximum_enforcement_pressure')) {
      parts.push(INSIGHT_BLOCKS.PRIORITY_WATER_SHUTOFF_COMPOUND);
    } else if (signals.includes('active_enforcement_current')) {
      parts.push(INSIGHT_BLOCKS.PRIORITY_WATER_SHUTOFF_RECENT);
    } else if (signals.includes('compounding_enforcement')) {
      parts.push(INSIGHT_BLOCKS.PRIORITY_WATER_SHUTOFF_WITH_VIOLATIONS);
    } else {
      parts.push(INSIGHT_BLOCKS.PRIORITY_WATER_SHUTOFF);
    }
  } else if (signals.includes('utility_enforcement') || 
      classified.some(v => v.category === 'Utility' && v.priority === 'high')) {
    parts.push(INSIGHT_BLOCKS.PRIORITY_UTILITY);
  }
  
  const hasCondemnation = classified.some(v => {
    const status = (v.original.status || '').toLowerCase();
    const desc = (v.original.raw_description || '').toLowerCase();
    return status.includes('condemned') || desc.includes('condemned') || 
           desc.includes('unsafe structure') || desc.includes('imminent danger');
  });
  if (hasCondemnation) {
    parts.push(INSIGHT_BLOCKS.PRIORITY_CONDEMNATION);
  }
  
  const hasLegal = classified.some(v => {
    const status = (v.original.status || '').toLowerCase();
    return status.includes('legal') || status.includes('court') || status.includes('prosecution');
  });
  if (hasLegal && !hasCondemnation) {
    parts.push(INSIGHT_BLOCKS.PRIORITY_LEGAL);
  }
  
  if (signals.includes('fire_citation') || 
      classified.some(v => v.category === 'Fire' && v.priority === 'high')) {
    parts.push(INSIGHT_BLOCKS.PRIORITY_FIRE_MARSHAL);
  }
  
  // Block E - Category Specific
  const hasStructural = classified.some(v => v.category === 'Structural');
  const hasVacancy = classified.some(v => v.category === 'Vacancy');
  const hasSafety = classified.some(v => v.category === 'Safety');
  const hasExterior = classified.some(v => v.category === 'Exterior');
  
  if (hasStructural && !hasCondemnation && signals.includes('structural_citation')) {
    parts.push(INSIGHT_BLOCKS.CATEGORY_STRUCTURAL);
  }
  if (hasVacancy || signals.includes('vacancy_citation')) {
    parts.push(INSIGHT_BLOCKS.CATEGORY_VACANCY);
  }
  if (hasSafety && !hasCondemnation) {
    parts.push(INSIGHT_BLOCKS.CATEGORY_SAFETY);
  }
  
  // Block F - Escalation
  if (signals.includes('enforcement_escalation') || intelligence.escalated) {
    const statuses = classified.map(v => (v.original.status || '').toLowerCase()).join(' ');
    if (statuses.includes('prosecution')) {
      parts.push(INSIGHT_BLOCKS.ESCALATION_PROSECUTION);
    } else if (statuses.includes('court')) {
      parts.push(INSIGHT_BLOCKS.ESCALATION_COURT);
    } else if (statuses.includes('board') || statuses.includes('hearing')) {
      parts.push(INSIGHT_BLOCKS.ESCALATION_BOARD);
    }
  }
  
  // Block G - Pattern
  if (signals.includes('recurring_enforcement') || intelligence.repeat_offender) {
    parts.push(INSIGHT_BLOCKS.PATTERN_REPEAT);
  }
  if (signals.includes('coordinated_enforcement') || signals.includes('multi_department') || intelligence.multi_department) {
    parts.push(INSIGHT_BLOCKS.PATTERN_MULTI_DEPT);
  }
  
  // Fallback if no blocks triggered
  if (parts.length === 0) {
    const highPriority = classified.filter(v => v.priority === 'high');
    const mediumPriority = classified.filter(v => v.priority === 'medium');
    
    if (highPriority.length > 0) {
      const category = highPriority[0].category;
      parts.push(`High-priority ${category.toLowerCase()} enforcement actions documented.`);
    } else if (mediumPriority.length > 0) {
      const category = mediumPriority[0].category;
      parts.push(`Active ${category.toLowerCase()} compliance matters under review.`);
    } else if (hasExterior) {
      parts.push(INSIGHT_BLOCKS.CATEGORY_EXTERIOR);
    } else if (intelligence.total_violations > 0) {
      const count = intelligence.total_violations;
      const open = intelligence.open_violations;
      if (open > 0) {
        parts.push(`${open} open municipal citation${open > 1 ? 's' : ''} pending resolution.`);
      } else {
        parts.push(`${count} municipal citation${count > 1 ? 's' : ''} on record.`);
      }
    } else {
      parts.push("Minimal enforcement activity documented.");
    }
  }
  
  // Select up to 3 blocks, max 280 chars
  const prioritizedParts = parts.slice(0, 3);
  let result = prioritizedParts.join(' ');
  
  if (result.length > 280) {
    result = prioritizedParts.slice(0, 2).join(' ');
    if (result.length > 280) {
      result = prioritizedParts[0];
      if (result.length > 280) {
        result = result.substring(0, 277) + '...';
      }
    }
  }
  
  return result;
}
