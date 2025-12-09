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

// Enhanced investor-psychology focused prompt
const SNAP_INSIGHT_PROMPT = `You are Snap Insight, a real estate distress intelligence engine.

MISSION:
Convert raw municipal enforcement data into investor-actionable opportunity signals.

INPUT: Raw city violation notes (enforcement language, inspector observations, complaint details)
OUTPUT: One concise investor insight (max 280 characters)

RULES - STRICT COMPLIANCE:

NEVER mention:
- City/jurisdiction names
- Inspector names or titles
- Violation numbers or case IDs
- Legal terms (citation, fine, court, prosecution)
- Tenant/occupant information
- Neighbor complaints or disputes
- Death, crime, or personal behavior
- Enforcement deadlines or penalties

ALWAYS frame insights around:
- Observable property condition
- Deferred maintenance patterns
- Structural/safety concerns (factual only)
- Vacancy or abandonment signals
- Duration of non-compliance (implies owner capacity)
- Multi-system failures (roof + electrical + foundation = distress)

TONE: Neutral, factual, opportunity-focused
PERSPECTIVE: "What does this tell me about the owner's situation and property condition?"

EXAMPLES OF GOOD INSIGHTS:
✓ "Prolonged structural and exterior maintenance issues suggest owner capacity constraints. Property may represent value-add opportunity."
✓ "Multiple unresolved building system failures over 18+ months. Indicates deferred capital expenditure and possible financial stress."
✓ "Fire-related damage with extended non-remediation period. Potential distressed asset opportunity."

EXAMPLES OF BAD INSIGHTS (NEVER DO THIS):
✗ "City cited owner for violations after tenant complaint"
✗ "Inspector found illegal occupancy and safety hazards"
✗ "Property faces $5,000 in fines if not corrected by deadline"

OUTPUT FORMAT:
[Condition statement] + [Distress signal] + [Opportunity implication]

Remember: You are translating enforcement pressure into investment intelligence.`;

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
      
      // Generate insight
      if (!rawDescriptions || rawDescriptions.length === 0) {
        console.log(`[generate-insights] No raw descriptions for property ${property.id}, using signal-based fallback`);
        snapInsight = generateSignalBasedInsight(scoreResult.signals, intelligence, classifiedViolations);
      } else if (!LOVABLE_API_KEY) {
        console.log(`[generate-insights] No LOVABLE_API_KEY set, using signal-based fallback`);
        snapInsight = generateSignalBasedInsight(scoreResult.signals, intelligence, classifiedViolations);
      } else {
        try {
          snapInsight = await generateAIInsight(rawDescriptions, violationTypes, LOVABLE_API_KEY);
        } catch (aiError) {
          console.error(`[generate-insights] AI error for ${property.id}:`, aiError);
          snapInsight = generateSignalBasedInsight(scoreResult.signals, intelligence, classifiedViolations);
        }
      }
      
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

    console.log(`[generate-insights] Generated insights for ${updates.length} properties`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: updates.length,
        total: propertyIds.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("Error in generate-insights:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Aggregate violation data at property level
function aggregatePropertyIntelligence(violations: Violation[]): PropertyIntelligence {
  const openStatuses = ['open', 'pending', 'active', 'unresolved'];
  const escalatedStatuses = ['board', 'legal', 'court', 'condemned', 'prosecution'];
  
  const openViolations = violations.filter(v => {
    const status = (v.status || '').toLowerCase();
    return openStatuses.some(s => status.includes(s)) || !status.includes('closed');
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

// SNAP SCORING ENGINE v2.0
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
  };
  
  // 1. TIME PRESSURE (Max 30 points) - +3 points per month open
  const maxDaysOpen = Math.max(...violations.map(v => v.days_open || 0), 0);
  const monthsOpen = Math.floor(maxDaysOpen / 30);
  components.timeScore = Math.min(30, monthsOpen * 3);
  score += components.timeScore;
  
  if (maxDaysOpen > 180) {
    signals.push('chronic_neglect');
  }
  
  // 2. SEVERITY MATRIX (Max 40 points)
  const severityPoints = { severe: 40, moderate: 15, minor: 5 };
  const severeCount = classified.filter(v => v.severity === 'severe').length;
  const moderateCount = classified.filter(v => v.severity === 'moderate').length;
  const minorCount = classified.filter(v => v.severity === 'minor').length;
  
  // First severe issue: full points, additional: diminishing returns
  if (severeCount > 0) {
    components.severityScore += 40 + Math.min((severeCount - 1) * 10, 20);
    
    // Check specific severe categories
    const hasFire = classified.some(v => v.severity === 'severe' && v.category === 'Fire');
    const hasStructural = classified.some(v => v.severity === 'severe' && v.category === 'Structural');
    if (hasFire) signals.push('fire_damage');
    if (hasStructural) signals.push('structural_issues');
  }
  
  components.severityScore += Math.min(moderateCount * 15, 30);
  components.severityScore += Math.min(minorCount * 5, 10);
  score += Math.min(components.severityScore, 60); // Cap severity contribution
  
  // 3. REPEAT OFFENDER BONUS (Max 25 points)
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
  
  // 4. MULTI-DEPARTMENT ENFORCEMENT (Max 25 points)
  const uniqueCategories = [...new Set(classified.map(v => v.category))];
  if (uniqueCategories.length >= 3) {
    components.multiDeptScore = 25;
    signals.push('coordinated_enforcement');
  } else if (intelligence.multi_department) {
    components.multiDeptScore = 15;
    signals.push('multi_department');
  }
  score += components.multiDeptScore;
  
  // 5. STATUS ESCALATION (Max 30 points)
  if (intelligence.escalated) {
    const statuses = violations.map(v => (v.status || '').toLowerCase());
    
    if (statuses.some(s => s.includes('condemned') || s.includes('prosecution'))) {
      components.escalationScore = 30;
    } else if (statuses.some(s => s.includes('legal') || s.includes('court'))) {
      components.escalationScore = 25;
    } else if (statuses.some(s => s.includes('board') || s.includes('hearing'))) {
      components.escalationScore = 15;
    }
    
    signals.push('legal_escalation');
  }
  score += components.escalationScore;
  
  // 6. ABANDONMENT/VACANCY SIGNALS (Max 25 points)
  const hasVacancySignals = classified.some(v => 
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
  
  // Check for utility issues in descriptions
  const hasUtilityIssues = classified.some(v => v.category === 'Utility');
  if (hasUtilityIssues) {
    signals.push('utility_issues');
  }
  
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

// Generate context-aware insight based on detected signals
function generateSignalBasedInsight(
  signals: string[],
  intelligence: PropertyIntelligence,
  classified: ViolationWithSeverity[]
): string {
  const insights: string[] = [];
  
  // Time pressure context
  if (signals.includes('chronic_neglect')) {
    insights.push('Extended non-compliance period (180+ days) suggests owner capacity constraints');
  }
  
  // Repeat offender context
  if (signals.includes('chronic_offender')) {
    insights.push('Pattern of repeat violations indicates systemic property management challenges');
  } else if (signals.includes('repeat_violations')) {
    insights.push('Multiple violations noted on property');
  }
  
  // Multi-department context
  if (signals.includes('coordinated_enforcement')) {
    insights.push('Multiple city departments involved - signals serious property deterioration');
  } else if (signals.includes('multi_department')) {
    insights.push('Cross-department enforcement activity detected');
  }
  
  // Legal escalation context
  if (signals.includes('legal_escalation')) {
    insights.push('Case escalated to legal proceedings - owner may face financial pressure');
  }
  
  // Vacancy context
  if (signals.includes('vacancy_indicators')) {
    insights.push('Vacancy and abandonment signals present - potential acquisition opportunity');
  }
  
  // Fire/Structural
  if (signals.includes('fire_damage')) {
    insights.push('Fire-related damage requires immediate capital investment');
  }
  if (signals.includes('structural_issues')) {
    insights.push('Structural concerns identified requiring remediation');
  }
  
  // Utility issues
  if (signals.includes('utility_issues')) {
    insights.push('Building system failures detected');
  }
  
  // Default based on severity
  if (insights.length === 0) {
    const severeCount = classified.filter(v => v.severity === 'severe').length;
    const moderateCount = classified.filter(v => v.severity === 'moderate').length;
    
    if (severeCount > 0) {
      insights.push('Critical property conditions require investor attention');
    } else if (moderateCount > 0) {
      insights.push('Property shows deferred maintenance patterns');
    } else if (intelligence.total_violations > 0) {
      insights.push('Minor exterior maintenance items noted. Value-add opportunity potential.');
    } else {
      insights.push('Property condition requires further assessment.');
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
