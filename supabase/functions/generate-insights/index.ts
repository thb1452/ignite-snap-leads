/**
 * SNAP INSIGHT GENERATION v7.1 - HYBRID AI + DETERMINISTIC ENGINE
 * 
 * Properties with snap_score >= 50: AI-generated enforcement-pressure insight
 *   - Uses Lovable AI (Gemini Flash) via gateway
 *   - Strict enforcement-neutral framing (NO investor/acquisition language)
 *   - Falls back to deterministic engine if AI credits exhausted or error
 * 
 * Properties with snap_score < 50 (or AI unavailable): deterministic rule-based engine v4.1
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const VERSION = "v7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-3-flash-preview";
const SNAP_SCORE_AI_THRESHOLD = 20;

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
  oldest_violation_days: number;
  high_priority_count: number;
  medium_priority_count: number;
  low_priority_count: number;
}

// ============================================================================
// DETERMINISTIC INSIGHT BLOCKS
// ============================================================================
const INSIGHT_BLOCKS = {
  PRIORITY_WATER_SHUTOFF: "Municipal water service disconnected — direct enforcement action taken by the utility authority.",
  PRIORITY_WATER_SHUTOFF_WITH_VIOLATIONS: "Water service disconnected with concurrent open code violations — multiple enforcement bodies actively engaged.",
  PRIORITY_CONDEMNATION: "Condemnation or unsafe structure orders documented.",
  PRIORITY_LEGAL: "Case referred for legal enforcement action.",
  PRIORITY_FIRE_MARSHAL: "Fire marshal orders or fire safety citations on file.",
} as const;

// ============================================================================
// AI INSIGHT GENERATION — v7.1 improvements:
//   - max_tokens 300, temperature 0.5
//   - 12 violations passed, severity counts in prompt
//   - oldest_violation_days in prompt
// ============================================================================
async function generateAIInsight(
  property: { address: string; city: string; enforcement_type?: string },
  violations: Violation[],
  classified: ViolationWithPriority[],
  intelligence: PropertyIntelligence,
  scoreResult: SnapScoreResult,
  apiKey: string
): Promise<string | null> {
  try {
    const categories = [...new Set(classified.map(v => v.category))].join(', ');
    const highPriority = classified.filter(v => v.priority === 'high');
    const medPriority = classified.filter(v => v.priority === 'medium');
    const lowPriority = classified.filter(v => v.priority === 'low');

    // Pass up to 12 violations (not 8)
    const violationSummary = violations.slice(0, 12).map(v => {
      const desc = v.raw_description ? ` | Description: ${v.raw_description.slice(0, 120)}` : '';
      return `- Type: ${v.violation_type || 'Unknown'} | Status: ${v.status || 'Unknown'} | Days open: ${v.days_open ?? 'N/A'}${desc}`;
    }).join('\n');

    const isWaterShutoff = property.enforcement_type === 'water_shutoff';

    const systemPrompt = `You are a municipal enforcement data analyst. Write concise, factual, enforcement-pressure summaries for code compliance records.

STRICT RULES:
1. Write from the perspective of a neutral municipal enforcement data analyst — NOT a real estate investor.
2. NEVER use words like: investor, acquisition, opportunity, distress, motivated, deal, profit, upside, buy, purchase, wholesale, flip, value-add, discounted, negotiation leverage, below market, negotiate, motivated seller, financial hardship, financial distress.
3. Focus ONLY on: what enforcement actions municipalities have taken, how recent they are, and what that signals about ongoing oversight activity. USE the violation descriptions provided to write specific, grounded insights — reference the actual violation types and details rather than generic statements.${isWaterShutoff ? ' This property has a confirmed water service disconnection — frame it as an ACTIVE MUNICIPAL ENFORCEMENT ACTION.' : ' This property does NOT have a water disconnection — do NOT mention water service disconnection or water shutoff in your response.'}
4. Keep the summary to 1–3 sentences, max 280 characters.
5. Write in third-person, factual, neutral tone.
6. Be SPECIFIC — mention actual violation categories, counts, and timeframes. Do not write generic statements.`;

    const userPrompt = `Write an enforcement-pressure insight for this property:

Enforcement type: ${isWaterShutoff ? 'WATER DISCONNECTION (confirmed)' : 'CODE VIOLATION (standard — no water disconnection)'}
Address: ${property.address}, ${property.city}
Snap Score: ${scoreResult.score}/100
Open violations: ${intelligence.open_violations} of ${intelligence.total_violations} total
Severity breakdown: ${highPriority.length} high-priority, ${medPriority.length} medium-priority, ${lowPriority.length} low-priority
Enforcement categories: ${categories}
${highPriority.length > 0 ? `High-priority categories: ${[...new Set(highPriority.map(v => v.category))].join(', ')}` : ''}
Average days open: ${intelligence.avg_days_open}
Oldest violation: ${intelligence.oldest_violation_days} days ago
Escalated: ${intelligence.escalated ? 'Yes' : 'No'}
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
        max_tokens: 300,
        temperature: 0.5,
      }),
    });

    if (response.status === 429 || response.status === 402) {
      console.warn(`[generate-insights ${VERSION}] AI unavailable (${response.status}), falling back to deterministic`);
      return null;
    }

    if (!response.ok) {
      console.error(`[generate-insights ${VERSION}] AI gateway error ${response.status}`);
      return null;
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content?.trim();

    if (!text || text.length < 10) return null;

    // Truncate at 280 chars but never mid-word
    if (text.length > 280) {
      const truncated = text.substring(0, 277);
      const lastSpace = truncated.lastIndexOf(' ');
      return (lastSpace > 200 ? truncated.substring(0, lastSpace) : truncated) + '...';
    }
    return text;
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

    const { data: properties, error: fetchError } = await supabase
      .from("properties")
      .select(`
        id,
        address,
        city,
        snap_score,
        jurisdiction_id,
        enforcement_type,
        escalated,
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
          success: true, processed: 0, total: propertyIds.length,
          message: "No properties found to process", _version: VERSION
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[generate-insights ${VERSION}] Processing ${properties.length} properties`);

    const updates = [];
    let successCount = 0;
    let errorCount = 0;
    let aiGeneratedCount = 0;
    let deterministicCount = 0;
    let aiCreditsExhausted = false;
    let aiCallCount = 0;

    const throttleAI = async () => {
      aiCallCount++;
      if (aiCallCount > 1) {
        await new Promise(resolve => setTimeout(resolve, 1200));
      }
    };

    for (const property of properties) {
      const violations = (property.violations || []) as Violation[];
      
      if ((property as any).enforcement_type === 'water_shutoff') {
        (violations as any).__enforcement_type = 'water_shutoff';
      }
      
      const classifiedViolations = violations.map(v => classifyViolation(v));
      const intelligence = aggregatePropertyIntelligence(violations, classifiedViolations, (property as any).escalated);
      const scoreResult = calculateEnforcementIntensity(violations, classifiedViolations, intelligence);

      let snapInsight: string;
      let method: 'ai' | 'deterministic' = 'deterministic';

      const effectiveScore = Math.max(property.snap_score ?? 0, scoreResult.score);
      const shouldUseAI = LOVABLE_API_KEY && !aiCreditsExhausted && effectiveScore >= SNAP_SCORE_AI_THRESHOLD;

      if (shouldUseAI) {
        await throttleAI();
        const aiInsight = await generateAIInsight(
          { address: property.address, city: property.city, enforcement_type: (property as any).enforcement_type },
          violations, classifiedViolations, intelligence, scoreResult, LOVABLE_API_KEY!
        );

        if (aiInsight === null) {
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

    // Batch update
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

    console.log(`[generate-insights ${VERSION}] Complete: ${successCount} ok, ${errorCount} errors, ${aiGeneratedCount} AI, ${deterministicCount} deterministic`);

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
        _version: VERSION,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`[generate-insights ${VERSION}] Fatal error:`, error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error', _version: VERSION }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================================
// PROPERTY INTELLIGENCE AGGREGATION — v7.1
// Now accepts classified violations for severity counts
// Checks property-level escalated flag + violation statuses
// ============================================================================
function aggregatePropertyIntelligence(
  violations: Violation[],
  classified: ViolationWithPriority[],
  propertyEscalated?: boolean
): PropertyIntelligence {
  const escalatedStatuses = ['board', 'legal', 'court', 'condemned', 'prosecution'];
  const now = new Date();
  
  // Derive days_open from opened_date when null; warn if both null
  for (const v of violations) {
    if (v.days_open == null && v.opened_date) {
      const opened = new Date(v.opened_date);
      if (!isNaN(opened.getTime())) {
        v.days_open = Math.max(0, Math.floor((now.getTime() - opened.getTime()) / (1000 * 60 * 60 * 24)));
      }
    }
    // Also check last_updated as fallback for days_open
    if (v.days_open == null && v.last_updated) {
      const updated = new Date(v.last_updated);
      if (!isNaN(updated.getTime())) {
        v.days_open = Math.max(0, Math.floor((now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24)));
      }
    }
    if (v.days_open == null && !v.opened_date && !v.last_updated) {
      console.warn(`[generate-insights ${VERSION}] Violation ${v.id} has no date info — days_open defaults to 0`);
    }
  }
  
  const openViolations = violations.filter(v => (v.status || '').toLowerCase().trim() === 'open');
  
  const now_ts = now.getTime();
  const dates = violations
    .map(v => v.opened_date)
    .filter(d => d)
    .map(d => new Date(d!))
    .filter(d => !isNaN(d.getTime()) && d.getTime() <= now_ts) // Filter out future dates
    .sort((a, b) => a.getTime() - b.getTime());
  
  const daysOpen = violations.map(v => v.days_open || 0);
  const avgDays = daysOpen.length > 0 
    ? Math.round(daysOpen.reduce((a, b) => a + b, 0) / daysOpen.length) 
    : 0;
  
  const violationTypes = [...new Set(violations.map(v => v.violation_type).filter(Boolean))];
  
  // Escalation: check property flag OR violation statuses (condemned gets escalation even if closed)
  const hasStatusEscalation = violations.some(v => {
    const status = (v.status || '').toLowerCase();
    return escalatedStatuses.some(s => status.includes(s));
  });
  // Also check raw_description for condemned/condemnation even on closed violations
  const hasDescEscalation = violations.some(v => {
    const desc = (v.raw_description || '').toLowerCase();
    return desc.includes('condemned') || desc.includes('condemnation') || desc.includes('unsafe structure');
  });
  const isEscalated = !!propertyEscalated || hasStatusEscalation || hasDescEscalation;
  
  // Oldest violation in days
  const oldestDays = dates.length > 0 
    ? Math.max(0, Math.floor((now.getTime() - dates[0].getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  // Severity counts from classified violations
  const highCount = classified.filter(v => v.priority === 'high').length;
  const medCount = classified.filter(v => v.priority === 'medium').length;
  const lowCount = classified.filter(v => v.priority === 'low').length;

  // Multi-department: use keyword-derived categories (not just violation_type)
  const uniqueCategories = [...new Set(classified.map(v => v.category).filter(c => c !== 'Other'))];
  
  return {
    total_violations: violations.length,
    open_violations: openViolations.length,
    oldest_violation_date: dates.length > 0 ? dates[0].toISOString().split('T')[0] : null,
    newest_violation_date: dates.length > 0 ? dates[dates.length - 1].toISOString().split('T')[0] : null,
    avg_days_open: avgDays,
    violation_types: violationTypes,
    repeat_offender: violations.length >= 3,
    multi_department: uniqueCategories.length >= 2,
    escalated: isEscalated,
    oldest_violation_days: oldestDays,
    high_priority_count: highCount,
    medium_priority_count: medCount,
    low_priority_count: lowCount,
  };
}

// ============================================================================
// ENFORCEMENT INTENSITY SCORING — v7.1
// Fixes: progressive volume scaling (no cap at 50), recency checks last_updated
// first, escalation for condemned even if closed, multi-category from keywords
// ============================================================================
function calculateEnforcementIntensity(
  violations: Violation[],
  classified: ViolationWithPriority[],
  intelligence: PropertyIntelligence
): SnapScoreResult {
  let score = 0;
  const signals: string[] = [];
  
  const openViolations = violations.filter(v => (v.status || '').toLowerCase().trim() === 'open');
  const openClassified = classified.filter(c => (c.original.status || '').toLowerCase().trim() === 'open');
  
  // ── Duration Factor ──
  const maxDaysOpen = openViolations.length > 0 
    ? Math.max(...openViolations.map(v => v.days_open || 0), 0)
    : 0;
  const monthsOpen = Math.floor(maxDaysOpen / 30);
  score += Math.min(30, monthsOpen * 3);
  if (maxDaysOpen > 180) signals.push('extended_enforcement');
  
  // ── Priority Matrix ──
  const highPriorityCount = openClassified.filter(v => v.priority === 'high').length;
  const mediumPriorityCount = openClassified.filter(v => v.priority === 'medium').length;
  
  if (highPriorityCount > 0) {
    score += 40 + Math.min((highPriorityCount - 1) * 10, 20);
    if (openClassified.some(v => v.priority === 'high' && v.category === 'Fire')) signals.push('fire_citation');
    if (openClassified.some(v => v.priority === 'high' && v.category === 'Structural')) signals.push('structural_citation');
  }
  score += Math.min(mediumPriorityCount * 15, 30);
  
  // ── Repeat Activity & Volume ──
  const totalViolCount = violations.length;
  const openViolCount = openViolations.length;
  
  if (totalViolCount >= 10) {
    score += 30;
    signals.push('recurring_enforcement');
  } else if (totalViolCount >= 5) {
    score += 25;
    signals.push('recurring_enforcement');
  } else if (totalViolCount >= 3) {
    score += 15;
    signals.push('multiple_citations');
  } else if (totalViolCount >= 2) {
    score += 5;
    signals.push('multiple_citations');
  }

  // ── Open Violation Volume — PROGRESSIVE (no hard cap) ──
  // Uses log scaling so 200 open scores higher than 50
  if (openViolCount >= 200) {
    score += 70;
    signals.push('extreme_enforcement_load');
  } else if (openViolCount >= 100) {
    score += 60;
    signals.push('massive_enforcement_load');
  } else if (openViolCount >= 50) {
    score += 50;
    signals.push('massive_enforcement_load');
  } else if (openViolCount >= 20) {
    score += 40;
    signals.push('high_violation_volume');
  } else if (openViolCount >= 10) {
    score += 30;
    signals.push('high_violation_volume');
  } else if (openViolCount >= 5) {
    score += 20;
    signals.push('active_enforcement_load');
  } else if (openViolCount >= 3) {
    score += 10;
    signals.push('active_enforcement_load');
  }
  
  // ── Multi-Category (keyword-derived, not just violation_type) ──
  const openCategories = [...new Set(openClassified.map(v => v.category).filter(c => c !== 'Other'))];
  if (openCategories.length >= 3) {
    score += 25;
    signals.push('coordinated_enforcement');
  } else if (openCategories.length >= 2) {
    score += 15;
    signals.push('multi_department');
  }
  
  // ── Escalation — check ALL violations (not just open) for condemned ──
  if (intelligence.escalated) {
    const allStatuses = violations.map(v => (v.status || '').toLowerCase());
    const allDescs = violations.map(v => (v.raw_description || '').toLowerCase());
    const combined = [...allStatuses, ...allDescs].join(' ');
    
    if (combined.includes('condemned') || combined.includes('prosecution') || combined.includes('condemnation')) {
      score += 30;
      signals.push('enforcement_escalation');
    } else if (combined.includes('legal') || combined.includes('court')) {
      score += 25;
      signals.push('enforcement_escalation');
    } else if (combined.includes('board') || combined.includes('hearing')) {
      score += 15;
      signals.push('enforcement_escalation');
    }
  }
  
  // ── Vacancy ──
  const hasVacancySignals = openClassified.some(v => 
    v.category === 'Vacancy' ||
    (v.original.violation_type || '').toLowerCase().includes('vacant') ||
    (v.original.violation_type || '').toLowerCase().includes('abandon')
  );
  if (hasVacancySignals) {
    score += 25;
    signals.push('vacancy_citation');
  }
  
  // ── Recency — check last_updated FIRST, fall back to opened_date ──
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  const getRecentDate = (v: Violation): Date | null => {
    // Check last_updated first (more recent activity on old violations)
    if (v.last_updated) {
      const d = new Date(v.last_updated);
      if (!isNaN(d.getTime())) return d;
    }
    if (v.opened_date) {
      const d = new Date(v.opened_date);
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  };
  
  const hasRecent7 = violations.some(v => {
    const d = getRecentDate(v);
    return d && d >= sevenDaysAgo;
  });
  const hasRecent30 = !hasRecent7 && violations.some(v => {
    const d = getRecentDate(v);
    return d && d >= thirtyDaysAgo;
  });
  
  if (hasRecent7) {
    score += 40;
    signals.push('recent_activity');
  } else if (hasRecent30) {
    score += 20;
    signals.push('current_enforcement');
  }

  // ── Water Shutoff ──
  // Detect via enforcement_type first, then keyword scan — never silently skip
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
      score += 55;
      signals.push('maximum_enforcement_pressure');
    } else if (hasRecent7 || hasRecent30) {
      score += 48;
      signals.push('active_enforcement_current');
    } else if (hasOpenCodeViolations) {
      score += 42;
      signals.push('compounding_enforcement');
    } else {
      score += 40;
      signals.push('direct_municipal_action');
    }
  }

  if (!hasWaterShutoff && openClassified.some(v => v.category === 'Utility')) {
    signals.push('utility_enforcement');
  }
  
  // Cap score if all violations resolved (but escalated condemned still gets some credit)
  if (openViolations.length === 0 && violations.length > 0) {
    if (intelligence.escalated) {
      score = Math.min(score, 35); // Condemned properties keep some score even if closed
    } else {
      score = Math.min(score, 20);
    }
  }
  
  const finalScore = Math.min(100, Math.max(0, score));
  
  let activityClass: 'critical' | 'elevated' | 'monitoring' = 'monitoring';
  if (finalScore >= 70) activityClass = 'critical';
  else if (finalScore >= 40) activityClass = 'elevated';
  
  return { score: finalScore, signals, activityClass };
}

// ============================================================================
// VIOLATION CLASSIFICATION — uses keyword scan on combined type + description
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
  
  if (combined.includes('zoning') || combined.includes('zone violation') ||
      combined.includes('land use') || combined.includes('code enforcement') ||
      combined.includes('unpermitted') || combined.includes('without permit') ||
      combined.includes('permit violation') || combined.includes('illegal construction')) {
    return { category: 'Zoning', priority: 'medium', original: violation };
  }

  if (combined.includes('property maintenance') || combined.includes('property inspection') ||
      combined.includes('code compliance') || combined.includes('nuisance')) {
    return { category: 'Maintenance', priority: 'medium', original: violation };
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
  
  // Open violations of unknown type → medium priority (not ignored)
  const status = (violation.status || '').toLowerCase().trim();
  if (status === 'open') {
    return { category: 'General Enforcement', priority: 'medium', original: violation };
  }
  
  return { category: 'Other', priority: 'low', original: violation };
}

// ============================================================================
// DETERMINISTIC INSIGHT ENGINE v4.1
// For score <50: includes highest-priority categories, open count, oldest days
// ============================================================================
function composeEnforcementInsight(
  signals: string[],
  intelligence: PropertyIntelligence,
  classified: ViolationWithPriority[]
): string {
  if (intelligence.total_violations === 0 && classified.length === 0) {
    return "No active enforcement actions currently on file.";
  }

  const parts: string[] = [];
  const openCount = intelligence.open_violations;
  const totalCount = intelligence.total_violations;
  const openClassified = classified.filter(c => (c.original.status || '').toLowerCase().trim() === 'open');
  const openCategories = [...new Set(openClassified.map(v => v.category).filter(c => c !== 'Other'))];
  const allCategories = [...new Set(classified.map(v => v.category).filter(c => c !== 'Other'))];
  const maxDaysOpen = openClassified.length > 0 ? Math.max(...openClassified.map(v => v.original.days_open || 0), 0) : 0;
  
  // Get highest-priority categories for specificity
  const highCats = [...new Set(classified.filter(v => v.priority === 'high').map(v => v.category))];
  const medCats = [...new Set(classified.filter(v => v.priority === 'medium').map(v => v.category))];

  const getSnippet = (): string | null => {
    const best = classified.find(v => v.original.raw_description && v.original.raw_description.length > 15 && !v.original.raw_description.toLowerCase().includes('unknown'));
    if (!best) return null;
    const raw = best.original.raw_description!.trim();
    return raw.length > 70 ? raw.slice(0, 67) + '...' : raw;
  };

  const durationPhrase = (): string | null => {
    if (maxDaysOpen >= 730) return `oldest open ${Math.floor(maxDaysOpen / 365)}+ years`;
    if (maxDaysOpen >= 365) return 'oldest open 1+ year';
    if (maxDaysOpen >= 60) return `open ${maxDaysOpen} days`;
    if (maxDaysOpen >= 14) return `open ${Math.floor(maxDaysOpen / 7)} weeks`;
    return null;
  };

  const catPhrase = (cats: string[]): string => {
    if (cats.length === 0) return '';
    if (cats.length === 1) return cats[0].toLowerCase();
    if (cats.length === 2) return `${cats[0].toLowerCase()} and ${cats[1].toLowerCase()}`;
    return `${cats.slice(0, 2).map(c => c.toLowerCase()).join(', ')} +${cats.length - 2} more`;
  };

  // ── Water shutoff ──
  if (signals.includes('water_shutoff_enforcement')) {
    const durStr = durationPhrase();
    if (openCount > 1) {
      parts.push(`Water service disconnected with ${openCount} concurrent open citations${openCategories.length > 0 ? ` (${catPhrase(openCategories)})` : ''}.`);
    } else {
      parts.push('Water service disconnected — active municipal enforcement action on record.');
    }
    if (durStr) parts.push(`${durStr.charAt(0).toUpperCase() + durStr.slice(1)}.`);
    const snippet = getSnippet();
    if (snippet && parts.join(' ').length < 200) parts.push(`Noted: "${snippet}".`);
    return truncateInsight(parts);
  }

  // ── Standard: build unique insight with severity and oldest days ──
  const cats = openCount > 0 ? openCategories : allCategories;
  const durStr = durationPhrase();
  const snippet = getSnippet();
  const oldestDaysStr = intelligence.oldest_violation_days > 0 ? intelligence.oldest_violation_days : null;

  // Part 1: Quantified lead-in with highest-priority categories
  if (openCount > 0) {
    const priorityCats = highCats.length > 0 ? highCats : (medCats.length > 0 ? medCats : cats);
    const catStr = priorityCats.length > 0 ? ` covering ${catPhrase(priorityCats)}` : '';
    const durSuffix = durStr ? `, ${durStr}` : '';
    parts.push(`${openCount} open citation${openCount > 1 ? 's' : ''}${catStr}${durSuffix}.`);
  } else if (totalCount > 0) {
    const catStr = allCategories.length > 0 ? ` (${catPhrase(allCategories)})` : '';
    parts.push(`${totalCount} resolved citation${totalCount > 1 ? 's' : ''}${catStr} on record.`);
  }

  // Part 2: High-priority flags
  if (signals.includes('enforcement_escalation') || intelligence.escalated) {
    const allText = classified.map(v => `${(v.original.status || '').toLowerCase()} ${(v.original.raw_description || '').toLowerCase()}`).join(' ');
    if (allText.includes('condemned') || allText.includes('condemnation')) parts.push('Condemnation order documented.');
    else if (allText.includes('prosecution')) parts.push('Referred for prosecution.');
    else if (allText.includes('court')) parts.push('Referred to municipal court.');
    else if (allText.includes('board') || allText.includes('hearing')) parts.push('Scheduled for board hearing.');
  }

  if (signals.includes('fire_citation') && !parts.some(p => p.toLowerCase().includes('fire'))) {
    parts.push('Fire safety citations on file.');
  }

  if (signals.includes('vacancy_citation') && !parts.some(p => p.toLowerCase().includes('vacan'))) {
    parts.push('Vacancy/abandonment citations documented.');
  }

  // Part 3: Recency
  if (signals.includes('recent_activity')) {
    parts.push('New activity within 7 days.');
  } else if (signals.includes('current_enforcement')) {
    parts.push('Updated within 30 days.');
  }

  // Part 4: Pattern signals
  if (signals.includes('coordinated_enforcement') || signals.includes('multi_department')) {
    if (!parts.some(p => p.includes('department') || p.includes('categories'))) {
      parts.push('Multi-department enforcement coordination.');
    }
  }
  if (signals.includes('recurring_enforcement') && !parts.some(p => p.includes('recurring') || p.includes('repeat'))) {
    parts.push(`Repeat enforcement pattern (${totalCount} total citations).`);
  }

  // Part 5: Oldest violation days context
  if (oldestDaysStr && oldestDaysStr > 365 && !parts.some(p => p.includes('year'))) {
    parts.push(`Enforcement history spans ${Math.floor(oldestDaysStr / 365)}+ years.`);
  }

  // Part 6: Raw description snippet
  if (snippet && parts.join(' ').length < 190 && !parts.some(p => p.includes('Noted'))) {
    parts.push(`Noted: "${snippet}".`);
  }

  if (parts.length === 0) {
    if (totalCount > 0) return `${totalCount} municipal citation${totalCount > 1 ? 's' : ''} on record.`;
    return "No active enforcement actions currently on file.";
  }

  return truncateInsight(parts);
}

function truncateInsight(parts: string[]): string {
  // Select up to 4 blocks, max 280 chars
  const prioritizedParts = parts.slice(0, 4);
  let result = prioritizedParts.join(' ');

  if (result.length > 280) {
    result = prioritizedParts.slice(0, 3).join(' ');
    if (result.length > 280) {
      result = prioritizedParts.slice(0, 2).join(' ');
      if (result.length > 280) {
        result = prioritizedParts[0];
        if (result.length > 280) {
          result = result.substring(0, 277) + '...';
        }
      }
    }
  }

  return result;
}
