/**
 * SECURITY CRITICAL: Snap Insight Generation v2.0
 * 
 * This function processes raw_description (raw city inspection notes) to generate
 * investor-safe summaries. The raw_description field is INTERNAL ONLY and is NEVER
 * exposed to end users through the UI or API responses.
 * 
 * Only snap_insight (the AI-generated summary) is shown in the frontend.
 * 
 * Build Brief Compliance:
 * - Raw city notes stored in violations.raw_description (INTERNAL)
 * - Sanitized summaries stored in properties.snap_insight (PUBLIC)
 * - NO raw violation details ever displayed to users
 * 
 * v2.0 Features:
 * - Property-level aggregation (total_violations, open_violations, etc.)
 * - Advanced scoring algorithm with time pressure, severity matrix, repeat offense detection
 * - Distress signal detection and storage
 * - Opportunity class classification
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Violation {
  id: string;
  violation_type: string;
  status: string;
  days_open: number | null;
  opened_date: string | null;
  raw_description: string | null;
  last_updated: string | null;
}

interface ViolationWithSeverity {
  category: string;
  severity: 'minor' | 'moderate' | 'severe';
  original: Violation;
}

interface SnapScoreResult {
  score: number;
  signals: string[];
  opportunityClass: 'distressed' | 'value_add' | 'watch';
  components: {
    timeScore: number;
    severityScore: number;
    repeatScore: number;
    multiDeptScore: number;
    escalationScore: number;
    vacancyScore: number;
  };
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

// =============================================================================
// SNAP INSIGHT DOCTRINE v2.1
// =============================================================================
// The SnapInsight is a CATEGORY DESCRIPTION grounded in inspection data.
// It describes WHAT the enforcement record shows, not WHAT IT MEANS for anyone.
//
// DOCTRINE:
// 1. Describe the enforcement category (what type of issues are documented)
// 2. Base language only on observed inspection notes
// 3. NO implied owner intent, urgency, or predicted outcome
// 4. NO investment framing, opportunity language, or action suggestions
// =============================================================================

const SNAP_INSIGHT_PROMPT = `You are summarizing municipal enforcement records for a property.
Your output is a factual category description based solely on inspection documentation.

DOCTRINE (non-negotiable):
1. Describe WHAT the enforcement record documents (violation types, physical conditions)
2. Use ONLY language that appears in or is directly supported by the inspection notes
3. NEVER imply owner intent, motivation, urgency, or predicted outcomes
4. NEVER suggest what anyone should do or what might happen next

FORBIDDEN:
- "motivated seller", "opportunity", "distressed", "value-add"
- "owner may be...", "likely to...", "suggests willingness..."
- "act now", "time-sensitive", "escalating", "pressure"
- Legal outcomes, fines, penalties, court actions, threats
- Any urgency or timeline implications

ALLOWED:
- Physical condition observations from inspection notes
- Violation category descriptions (structural, exterior, vacancy, etc.)
- Duration facts (e.g., "open 6+ months") without urgency framing
- Count facts (e.g., "3 open violations across 2 departments")

OUTPUT FORMAT:
A neutral, factual summary of what the enforcement record documents.
Max 280 characters. No labels. No commentary.`;

serve(async (req) => {
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

    // Fetch properties with their violations (including raw_description)
    const { data: properties, error: fetchError } = await supabase
      .from("properties")
      .select(`
        id,
        address,
        city,
        jurisdiction_id,
        violations (
          id,
          violation_type,
          status,
          days_open,
          opened_date,
          raw_description
        )
      `)
      .in("id", propertyIds);

    if (fetchError) {
      console.error("Error fetching properties:", fetchError);
      throw fetchError;
    }

    if (!properties || properties.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          processed: 0, 
          total: propertyIds.length,
          message: "No properties found to process"
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[generate-insights] Processing ${properties.length} properties`);

    const updates = [];
    const methodCounts = { ai: 0, rule_based: 0, no_data: 0 };

    // Process each property
    for (const property of properties) {
      const violations = (property.violations || []) as Violation[];
      
      // Aggregate property intelligence
      const intelligence = aggregatePropertyIntelligence(violations);
      
      // Classify violations with severity
      const classifiedViolations = violations.map(v => classifyViolation(v));
      
      // Calculate enhanced snap score with signals
      const scoreResult = calculateSnapScoreV2(violations, classifiedViolations, intelligence);
      
      // Collect raw descriptions for AI processing
      const rawDescriptions = violations
        .map(v => v.raw_description)
        .filter(d => d && d.trim())
        .join('\n\n');
      
      // Collect violation types for context
      const violationTypes = violations.map(v => v.violation_type || '').join(' ');
      
      let snapInsight: string;
      let insightMethod: 'ai' | 'rule_based' | 'no_data' = 'no_data';

      // Generate insight
      if (!rawDescriptions || rawDescriptions.length === 0) {
        console.log(`[generate-insights] No raw descriptions for property ${property.id}, using signal-based fallback`);
        snapInsight = generateSignalBasedInsight(scoreResult.signals, intelligence, classifiedViolations);
        insightMethod = 'no_data';
      } else if (!LOVABLE_API_KEY) {
        // CRITICAL WARNING: AI key missing - insights will be lower quality
        console.warn(`[generate-insights] ⚠️ LOVABLE_API_KEY not configured! Property ${property.id} has ${rawDescriptions.length} chars of description but AI unavailable.`);
        console.warn(`[generate-insights] ⚠️ Falling back to rule-based insights (lower quality). Set LOVABLE_API_KEY environment variable for AI-powered insights.`);
        snapInsight = generateSignalBasedInsight(scoreResult.signals, intelligence, classifiedViolations);
        insightMethod = 'rule_based';
      } else {
        try {
          snapInsight = await generateAIInsight(rawDescriptions, violationTypes, LOVABLE_API_KEY);
          insightMethod = 'ai';
        } catch (aiError) {
          console.error(`[generate-insights] ✗ AI generation failed for property ${property.id}:`, aiError);
          console.error(`[generate-insights] Error details: ${aiError instanceof Error ? aiError.message : String(aiError)}`);
          snapInsight = generateSignalBasedInsight(scoreResult.signals, intelligence, classifiedViolations);
          insightMethod = 'rule_based';
        }
      }

      // Track method used
      methodCounts[insightMethod]++;

      updates.push({
        id: property.id,
        snap_insight: snapInsight,
        snap_score: scoreResult.score,
        // Property intelligence columns
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
        opportunity_class: scoreResult.opportunityClass,
        last_analyzed_at: new Date().toISOString(),
      });
    }

    // Batch update all properties
    if (updates.length > 0) {
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
          console.error(`Error updating property ${update.id}:`, updateError);
        }
      }
    }

    console.log(`[generate-insights] =====================================================`);
    console.log(`[generate-insights] Insight Generation Summary:`);
    console.log(`[generate-insights]   ✓ AI-generated: ${methodCounts.ai} properties`);
    console.log(`[generate-insights]   ⚙ Rule-based fallback: ${methodCounts.rule_based} properties`);
    console.log(`[generate-insights]   ⊘ No data: ${methodCounts.no_data} properties`);
    console.log(`[generate-insights]   Total: ${updates.length} properties`);

    if (methodCounts.rule_based > 0 && !LOVABLE_API_KEY) {
      console.warn(`[generate-insights] ⚠️⚠️⚠️ ACTION REQUIRED ⚠️⚠️⚠️`);
      console.warn(`[generate-insights] ${methodCounts.rule_based} properties used rule-based insights because LOVABLE_API_KEY is not set.`);
      console.warn(`[generate-insights] Set environment variable: LOVABLE_API_KEY=your_key_here`);
      console.warn(`[generate-insights] Current insight quality: LOW (rule-based) | Expected: HIGH (AI-powered)`);
    }
    console.log(`[generate-insights] =====================================================`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: updates.length,
        total: propertyIds.length,
        breakdown: {
          ai_generated: methodCounts.ai,
          rule_based: methodCounts.rule_based,
          no_data: methodCounts.no_data,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("Error in generate-insights:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Aggregate violation data at property level
function aggregatePropertyIntelligence(violations: Violation[]): PropertyIntelligence {
  const escalatedStatuses = ['board', 'legal', 'court', 'condemned', 'prosecution'];
  
  // LIFECYCLE-AWARE: Only count violations with status = 'Open' as active
  // This ensures closed violations don't inflate distress signals
  const openViolations = violations.filter(v => {
    const status = (v.status || '').toLowerCase().trim();
    // Only 'open' status counts as active - closed, resolved, abated, etc. are historical
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

// SNAP SCORING ENGINE v2.0 - LIFECYCLE-AWARE
function calculateSnapScoreV2(
  violations: Violation[],
  classified: ViolationWithSeverity[],
  intelligence: PropertyIntelligence
): SnapScoreResult {
  let score = 0;
  const signals: string[] = [];
  const components = {
    timeScore: 0,
    severityScore: 0,
    repeatScore: 0,
    multiDeptScore: 0,
    escalationScore: 0,
    vacancyScore: 0,
    freshnessBoost: 0,
  };
  
  // LIFECYCLE-AWARE: Filter to only OPEN violations for active distress scoring
  const openViolations = violations.filter(v => 
    (v.status || '').toLowerCase().trim() === 'open'
  );
  const openClassified = classified.filter(c => 
    (c.original.status || '').toLowerCase().trim() === 'open'
  );
  
  // 1. TIME PRESSURE (Max 30 points) - only count OPEN violations
  const maxDaysOpen = openViolations.length > 0 
    ? Math.max(...openViolations.map(v => v.days_open || 0), 0)
    : 0;
  const monthsOpen = Math.floor(maxDaysOpen / 30);
  components.timeScore = Math.min(30, monthsOpen * 3);
  score += components.timeScore;
  
  if (maxDaysOpen > 180) {
    signals.push('chronic_neglect');
  }
  
  // 2. SEVERITY MATRIX (Max 40 points) - only count OPEN violations
  const severeCount = openClassified.filter(v => v.severity === 'severe').length;
  const moderateCount = openClassified.filter(v => v.severity === 'moderate').length;
  const minorCount = openClassified.filter(v => v.severity === 'minor').length;
  
  // First severe issue: full points, additional: diminishing returns
  if (severeCount > 0) {
    components.severityScore += 40 + Math.min((severeCount - 1) * 10, 20);
    
    // Check specific severe categories
    const hasFire = openClassified.some(v => v.severity === 'severe' && v.category === 'Fire');
    const hasStructural = openClassified.some(v => v.severity === 'severe' && v.category === 'Structural');
    if (hasFire) signals.push('fire_damage');
    if (hasStructural) signals.push('structural_issues');
  }
  
  components.severityScore += Math.min(moderateCount * 15, 30);
  components.severityScore += Math.min(minorCount * 5, 10);
  score += Math.min(components.severityScore, 60); // Cap severity contribution
  
  // 3. REPEAT OFFENDER BONUS (Max 25 points) - based on history (all violations)
  // Historical pattern still matters even if current violations are closed
  if (intelligence.repeat_offender) {
    if (violations.length >= 5) {
      components.repeatScore = 25;
      signals.push('chronic_offender');
    } else if (violations.length >= 3) {
      components.repeatScore = 15;
      signals.push('repeat_violations');
    }
  } else if (violations.length >= 2) {
    components.repeatScore = 5;
    signals.push('repeat_violations');
  }
  score += components.repeatScore;
  
  // 4. MULTI-DEPARTMENT ENFORCEMENT (Max 25 points) - only count OPEN violations
  const openCategories = [...new Set(openClassified.map(v => v.category))];
  if (openCategories.length >= 3) {
    components.multiDeptScore = 25;
    signals.push('coordinated_enforcement');
  } else if (openCategories.length >= 2) {
    components.multiDeptScore = 15;
    signals.push('multi_department');
  }
  score += components.multiDeptScore;
  
  // 5. STATUS ESCALATION (Max 30 points) - still matters if actively escalated
  if (intelligence.escalated) {
    const statuses = openViolations.map(v => (v.status || '').toLowerCase());
    
    if (statuses.some(s => s.includes('condemned') || s.includes('prosecution'))) {
      components.escalationScore = 30;
    } else if (statuses.some(s => s.includes('legal') || s.includes('court'))) {
      components.escalationScore = 25;
    } else if (statuses.some(s => s.includes('board') || s.includes('hearing'))) {
      components.escalationScore = 15;
    }
    
    if (components.escalationScore > 0) {
      signals.push('legal_escalation');
    }
  }
  score += components.escalationScore;
  
  // 6. ABANDONMENT/VACANCY SIGNALS (Max 25 points) - only count OPEN violations
  const hasVacancySignals = openClassified.some(v => 
    v.category === 'Vacancy' ||
    (v.original.violation_type || '').toLowerCase().includes('vacant') ||
    (v.original.violation_type || '').toLowerCase().includes('abandon') ||
    (v.original.violation_type || '').toLowerCase().includes('unsecured') ||
    (v.original.violation_type || '').toLowerCase().includes('boarded')
  );
  
  if (hasVacancySignals) {
    components.vacancyScore = 25;
    signals.push('vacancy_indicators');
  }
  score += components.vacancyScore;
  
  // Check for utility issues in descriptions - only OPEN violations
  const hasUtilityIssues = openClassified.some(v => v.category === 'Utility');
  if (hasUtilityIssues) {
    signals.push('utility_issues');
  }
  
  // If no open violations remain, significantly reduce score (property resolved)
  if (openViolations.length === 0 && violations.length > 0) {
    // Historical violations exist but all are closed - low distress
    score = Math.min(score, 20); // Cap at 20 for properties with only historical issues
  }
  
  // 7. FRESHNESS BOOST (Max 40 points) - Recent enforcement = motivated seller NOW
  // Properties with recent violations should rank higher than stale high-count properties
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  // Check for violations in the last 7 days (based on opened_date or last_updated)
  const hasViolationLast7Days = violations.some(v => {
    const violationDate = v.opened_date ? new Date(v.opened_date) : 
                          v.last_updated ? new Date(v.last_updated) : null;
    return violationDate && violationDate >= sevenDaysAgo;
  });
  
  // Check for violations in the last 8-30 days
  const hasViolationLast30Days = !hasViolationLast7Days && violations.some(v => {
    const violationDate = v.opened_date ? new Date(v.opened_date) : 
                          v.last_updated ? new Date(v.last_updated) : null;
    return violationDate && violationDate >= thirtyDaysAgo && violationDate < sevenDaysAgo;
  });
  
  if (hasViolationLast7Days) {
    components.freshnessBoost = 40;
    signals.push('hot_enforcement');
  } else if (hasViolationLast30Days) {
    components.freshnessBoost = 20;
    signals.push('recent_enforcement');
  }
  score += components.freshnessBoost;
  
  // Cap at 100
  const finalScore = Math.min(100, Math.max(0, score));
  
  // Classify opportunity
  let opportunityClass: 'distressed' | 'value_add' | 'watch' = 'watch';
  if (finalScore >= 70) {
    opportunityClass = 'distressed';
  } else if (finalScore >= 40) {
    opportunityClass = 'value_add';
  }
  
  return {
    score: finalScore,
    signals,
    opportunityClass,
    components,
  };
}

// Generate AI insight using Lovable AI Gateway
async function generateAIInsight(rawDescription: string, violationType: string, apiKey: string): Promise<string> {
  const prompt = `${SNAP_INSIGHT_PROMPT}

RAW NOTES:
${rawDescription}

VIOLATION TYPE:
${violationType}

OUTPUT:
Snap Summary only. No labels. No extra commentary.`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "user", content: prompt }
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI Gateway error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  let summary = data.choices?.[0]?.message?.content?.trim() || "";
  
  // Ensure max 280 characters
  if (summary.length > 280) {
    summary = summary.substring(0, 277) + "...";
  }
  
  return summary;
}

// Classify violation type with severity level
function classifyViolation(violation: Violation): ViolationWithSeverity {
  const t = (violation.violation_type || '').toLowerCase();
  const desc = (violation.raw_description || '').toLowerCase();
  const combined = `${t} ${desc}`;
  
  // SEVERE - Life Safety / Structural Integrity
  if (combined.includes('collapse') || combined.includes('unsafe structure') || 
      combined.includes('condemned') || combined.includes('foundation failure') ||
      combined.includes('imminent danger')) {
    return { category: 'Structural', severity: 'severe', original: violation };
  }
  
  if (combined.includes('fire damage') || combined.includes('burnt') || 
      combined.includes('smoke damage') || combined.includes('charred') ||
      combined.includes('fire-related damage')) {
    return { category: 'Fire', severity: 'severe', original: violation };
  }
  
  if (combined.includes('no utilities') || combined.includes('utility disconnect') ||
      combined.includes('no water') || combined.includes('no electric')) {
    return { category: 'Utility', severity: 'severe', original: violation };
  }
  
  // MODERATE - System Failures / Significant Issues
  if (combined.includes('roof leak') || combined.includes('structural damage') ||
      combined.includes('foundation crack') || combined.includes('major repair')) {
    return { category: 'Structural', severity: 'moderate', original: violation };
  }
  
  if (combined.includes('vacant') || combined.includes('abandon') || 
      combined.includes('unoccup') || combined.includes('boarded')) {
    return { category: 'Vacancy', severity: 'moderate', original: violation };
  }
  
  if (combined.includes('unsafe') || combined.includes('hazard') || 
      combined.includes('danger') || combined.includes('health')) {
    return { category: 'Safety', severity: 'moderate', original: violation };
  }
  
  if (combined.includes('plumbing') || combined.includes('electrical') ||
      combined.includes('sewage') || combined.includes('hvac')) {
    return { category: 'Utility', severity: 'moderate', original: violation };
  }
  
  // MINOR - Maintenance / Cosmetic
  if (combined.includes('paint') || combined.includes('siding') || 
      combined.includes('fence') || combined.includes('grass') ||
      combined.includes('weeds') || combined.includes('debris')) {
    return { category: 'Exterior', severity: 'minor', original: violation };
  }
  
  if (combined.includes('window') || combined.includes('door') ||
      combined.includes('screen') || combined.includes('gutter')) {
    return { category: 'Exterior', severity: 'minor', original: violation };
  }
  
  // Default based on keywords
  if (combined.includes('structur') || combined.includes('foundation') || 
      combined.includes('roof') || combined.includes('wall')) {
    return { category: 'Structural', severity: 'moderate', original: violation };
  }
  
  if (combined.includes('fire') || combined.includes('burn') || combined.includes('smoke')) {
    return { category: 'Fire', severity: 'severe', original: violation };
  }
  
  if (combined.includes('exterior') || combined.includes('facade')) {
    return { category: 'Exterior', severity: 'minor', original: violation };
  }
  
  return { category: 'Other', severity: 'minor', original: violation };
}

// =============================================================================
// FALLBACK INSIGHT GENERATOR - DOCTRINE v2.1
// =============================================================================
// When AI is unavailable, generate category descriptions from detected signals.
// Output must follow the same doctrine as AI insights:
// 1. Describe the enforcement category
// 2. Based only on inspection data
// 3. NO implied owner intent, urgency, or outcome
// =============================================================================
function generateSignalBasedInsight(
  signals: string[],
  intelligence: PropertyIntelligence,
  classified: ViolationWithSeverity[]
): string {
  const insights: string[] = [];
  
  // Build category-based descriptions from violation data
  const categories = [...new Set(classified.map(v => v.category))];
  const severeCount = classified.filter(v => v.severity === 'severe').length;
  const moderateCount = classified.filter(v => v.severity === 'moderate').length;
  
  // Primary category description
  if (signals.includes('fire_damage')) {
    insights.push('Enforcement record documents fire-related damage');
  } else if (signals.includes('structural_issues')) {
    insights.push('Enforcement record documents structural condition issues');
  } else if (signals.includes('vacancy_indicators')) {
    insights.push('Enforcement record documents vacancy or unsecured building');
  } else if (signals.includes('utility_issues')) {
    insights.push('Enforcement record documents building system issues');
  }
  
  // Violation count context (factual, no urgency)
  if (intelligence.open_violations > 0) {
    const deptCount = categories.length;
    if (deptCount >= 2) {
      insights.push(`${intelligence.open_violations} open violation(s) across ${deptCount} categories`);
    } else if (intelligence.open_violations >= 3) {
      insights.push(`${intelligence.open_violations} open violations documented`);
    }
  }
  
  // Duration context (factual, no urgency framing)
  if (signals.includes('chronic_neglect') && intelligence.avg_days_open > 0) {
    insights.push(`Oldest open violation: ${Math.floor(intelligence.avg_days_open / 30)}+ months`);
  }
  
  // Historical pattern (factual)
  if (intelligence.total_violations >= 5) {
    insights.push(`${intelligence.total_violations} total violations in enforcement history`);
  }
  
  // Default based on severity categories
  if (insights.length === 0) {
    if (severeCount > 0) {
      const severeCats = classified.filter(v => v.severity === 'severe').map(v => v.category);
      const uniqueSevereCats = [...new Set(severeCats)];
      insights.push(`Enforcement record includes ${uniqueSevereCats.join(', ').toLowerCase()} category violations`);
    } else if (moderateCount > 0) {
      insights.push('Enforcement record documents property maintenance violations');
    } else if (intelligence.total_violations > 0) {
      insights.push('Enforcement record documents minor exterior violations');
    } else {
      insights.push('No active enforcement violations on record');
    }
  }
  
  // Combine insights (max 280 chars)
  let result = insights.slice(0, 2).join('. ') + '.';
  if (result.length > 280) {
    result = insights[0] + '.';
    if (result.length > 280) {
      result = result.substring(0, 277) + '...';
    }
  }
  
  return result;
}
