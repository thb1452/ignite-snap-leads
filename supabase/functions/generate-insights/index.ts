/**
 * SECURITY CRITICAL: Snap Insight Generation v2.1
 * 
 * This function processes raw_description (raw city inspection notes) to generate
 * enforcement-focused summaries. The raw_description field is INTERNAL ONLY and is NEVER
 * exposed to end users through the UI or API responses.
 * 
 * Only snap_insight (the AI-generated summary) is shown in the frontend.
 * 
 * Build Brief Compliance:
 * - Raw city notes stored in violations.raw_description (INTERNAL)
 * - Sanitized summaries stored in properties.snap_insight (PUBLIC)
 * - NO raw violation details ever displayed to users
 * 
 * v2.1 Features:
 * - Property-level aggregation (total_violations, open_violations, etc.)
 * - Enforcement intensity scoring (neutral terminology)
 * - Signal detection using municipal enforcement language
 * - Enforcement activity classification
 * 
 * TERMINOLOGY (v2.1 - Enforcement Intelligence):
 * - "Duration Factor" not "Time Pressure"
 * - "Enforcement Priority" not "Severity"
 * - "Recency Weighting" not "Freshness Boost"
 * - "Enforcement Signals" not "Distress Signals"
 * - "Activity Class" not "Opportunity Class"
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

interface ViolationWithPriority {
  category: string;
  priority: 'high' | 'medium' | 'low';
  original: Violation;
}

interface SnapScoreResult {
  score: number;
  signals: string[];
  activityClass: 'critical' | 'elevated' | 'monitoring';
  components: {
    durationFactor: number;
    priorityScore: number;
    repeatScore: number;
    multiAgencyScore: number;
    escalationScore: number;
    vacancyScore: number;
    recencyWeighting: number;
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

// Enforcement intelligence insight prompt - neutral compliance focus
const SNAP_INSIGHT_PROMPT = `You are generating municipal enforcement activity summaries, NOT investment pitches.
Your role is to describe enforcement actions and property compliance status factually.

STRICT RULES:
- Describe enforcement activity only, not property condition assumptions
- Use municipal terminology, not real estate terminology
- Focus on what the city observed and documented
- Never suggest buying, selling, negotiating, or deal quality
- Never use urgency language (urgent, immediate, time-sensitive, act now)
- Never imply owner intent, motivation, or willingness to sell
- Never mention predicted outcomes or speculation about owners
- Never use investor-centric terms (opportunity, distressed, motivated, deal)

ALLOWED:
- Duration of enforcement actions (e.g., "active enforcement for 6+ months")
- Municipal classification and priority level
- Number and type of citations or notices
- Factual status of compliance actions
- Enforcement escalation status if documented

TONE: Risk assessment / Compliance intelligence / Enforcement activity summary

OUTPUT FORMAT: Single paragraph, max 280 characters. No labels or headers.`;

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
      
      // Classify violations with enforcement priority
      const classifiedViolations = violations.map(v => classifyViolation(v));
      
      // Calculate enforcement intensity score with signals
      const scoreResult = calculateEnforcementIntensity(violations, classifiedViolations, intelligence);
      
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

      // Map activityClass to legacy opportunityClass for database compatibility
      const opportunityClass = scoreResult.activityClass === 'critical' ? 'distressed' :
                               scoreResult.activityClass === 'elevated' ? 'value_add' : 'watch';

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
        opportunity_class: opportunityClass, // Keep DB column name for compatibility
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
  // This ensures closed violations don't inflate enforcement signals
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

// ENFORCEMENT INTENSITY SCORING v2.1 - LIFECYCLE-AWARE
// Uses neutral terminology: Duration Factor, Priority Score, Recency Weighting
function calculateEnforcementIntensity(
  violations: Violation[],
  classified: ViolationWithPriority[],
  intelligence: PropertyIntelligence
): SnapScoreResult {
  let score = 0;
  const signals: string[] = [];
  const components = {
    durationFactor: 0,
    priorityScore: 0,
    repeatScore: 0,
    multiAgencyScore: 0,
    escalationScore: 0,
    vacancyScore: 0,
    recencyWeighting: 0,
  };
  
  // LIFECYCLE-AWARE: Filter to only OPEN violations for active enforcement scoring
  const openViolations = violations.filter(v => 
    (v.status || '').toLowerCase().trim() === 'open'
  );
  const openClassified = classified.filter(c => 
    (c.original.status || '').toLowerCase().trim() === 'open'
  );
  
  // 1. DURATION FACTOR (Max 30 points) - only count OPEN violations
  // Measures: How long has enforcement been active?
  const maxDaysOpen = openViolations.length > 0 
    ? Math.max(...openViolations.map(v => v.days_open || 0), 0)
    : 0;
  const monthsOpen = Math.floor(maxDaysOpen / 30);
  components.durationFactor = Math.min(30, monthsOpen * 3);
  score += components.durationFactor;
  
  if (maxDaysOpen > 180) {
    signals.push('extended_enforcement');
  }
  
  // 2. ENFORCEMENT PRIORITY MATRIX (Max 40 points) - only count OPEN violations
  // Measures: How seriously does the municipality prioritize this?
  const highPriorityCount = openClassified.filter(v => v.priority === 'high').length;
  const mediumPriorityCount = openClassified.filter(v => v.priority === 'medium').length;
  const lowPriorityCount = openClassified.filter(v => v.priority === 'low').length;
  
  // First high-priority issue: full points, additional: diminishing returns
  if (highPriorityCount > 0) {
    components.priorityScore += 40 + Math.min((highPriorityCount - 1) * 10, 20);
    
    // Check specific high-priority categories
    const hasFire = openClassified.some(v => v.priority === 'high' && v.category === 'Fire');
    const hasStructural = openClassified.some(v => v.priority === 'high' && v.category === 'Structural');
    if (hasFire) signals.push('fire_citation');
    if (hasStructural) signals.push('structural_citation');
  }
  
  components.priorityScore += Math.min(mediumPriorityCount * 15, 30);
  components.priorityScore += Math.min(lowPriorityCount * 5, 10);
  score += Math.min(components.priorityScore, 60); // Cap priority contribution
  
  // 3. REPEAT ACTIVITY BONUS (Max 25 points) - based on history (all violations)
  // Measures: Pattern of enforcement activity at this address
  if (intelligence.repeat_offender) {
    if (violations.length >= 5) {
      components.repeatScore = 25;
      signals.push('recurring_enforcement');
    } else if (violations.length >= 3) {
      components.repeatScore = 15;
      signals.push('multiple_citations');
    }
  } else if (violations.length >= 2) {
    components.repeatScore = 5;
    signals.push('multiple_citations');
  }
  score += components.repeatScore;
  
  // 4. MULTI-AGENCY ENFORCEMENT (Max 25 points) - only count OPEN violations
  // Measures: Number of municipal departments involved
  const openCategories = [...new Set(openClassified.map(v => v.category))];
  if (openCategories.length >= 3) {
    components.multiAgencyScore = 25;
    signals.push('coordinated_enforcement');
  } else if (openCategories.length >= 2) {
    components.multiAgencyScore = 15;
    signals.push('multi_department');
  }
  score += components.multiAgencyScore;
  
  // 5. ESCALATION STATUS (Max 30 points) - still matters if actively escalated
  // Measures: Has the case been elevated to higher enforcement levels?
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
      signals.push('enforcement_escalation');
    }
  }
  score += components.escalationScore;
  
  // 6. VACANCY INDICATORS (Max 25 points) - only count OPEN violations
  // Measures: Has the property been cited for vacancy/abandonment?
  const hasVacancySignals = openClassified.some(v => 
    v.category === 'Vacancy' ||
    (v.original.violation_type || '').toLowerCase().includes('vacant') ||
    (v.original.violation_type || '').toLowerCase().includes('abandon') ||
    (v.original.violation_type || '').toLowerCase().includes('unsecured') ||
    (v.original.violation_type || '').toLowerCase().includes('boarded')
  );
  
  if (hasVacancySignals) {
    components.vacancyScore = 25;
    signals.push('vacancy_citation');
  }
  score += components.vacancyScore;
  
  // Check for utility enforcement in descriptions - only OPEN violations
  const hasUtilityIssues = openClassified.some(v => v.category === 'Utility');
  if (hasUtilityIssues) {
    signals.push('utility_enforcement');
  }
  
  // If no open violations remain, significantly reduce score (enforcement resolved)
  if (openViolations.length === 0 && violations.length > 0) {
    // Historical violations exist but all are closed - low activity level
    score = Math.min(score, 20); // Cap at 20 for properties with only historical issues
  }
  
  // 7. RECENCY WEIGHTING (Max 40 points) - Recent enforcement activity
  // Measures: How current is the enforcement data?
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
    components.recencyWeighting = 40;
    signals.push('recent_activity');
  } else if (hasViolationLast30Days) {
    components.recencyWeighting = 20;
    signals.push('current_enforcement');
  }
  score += components.recencyWeighting;
  
  // Cap at 100
  const finalScore = Math.min(100, Math.max(0, score));
  
  // Classify enforcement activity level
  let activityClass: 'critical' | 'elevated' | 'monitoring' = 'monitoring';
  if (finalScore >= 70) {
    activityClass = 'critical';
  } else if (finalScore >= 40) {
    activityClass = 'elevated';
  }
  
  return {
    score: finalScore,
    signals,
    activityClass,
    components,
  };
}

// Generate AI insight using Lovable AI Gateway
async function generateAIInsight(rawDescription: string, violationType: string, apiKey: string): Promise<string> {
  const prompt = `${SNAP_INSIGHT_PROMPT}

ENFORCEMENT RECORDS:
${rawDescription}

VIOLATION CATEGORIES:
${violationType}

Generate a factual enforcement activity summary:`;

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

// Classify violation type with enforcement priority level
function classifyViolation(violation: Violation): ViolationWithPriority {
  const t = (violation.violation_type || '').toLowerCase();
  const desc = (violation.raw_description || '').toLowerCase();
  const combined = `${t} ${desc}`;
  
  // HIGH PRIORITY - Immediate Safety / Service Termination
  if (combined.includes('collapse') || combined.includes('unsafe structure') || 
      combined.includes('condemned') || combined.includes('foundation failure') ||
      combined.includes('imminent danger')) {
    return { category: 'Structural', priority: 'high', original: violation };
  }
  
  if (combined.includes('fire damage') || combined.includes('burnt') || 
      combined.includes('smoke damage') || combined.includes('charred') ||
      combined.includes('fire-related damage')) {
    return { category: 'Fire', priority: 'high', original: violation };
  }
  
  if (combined.includes('no utilities') || combined.includes('utility disconnect') ||
      combined.includes('no water') || combined.includes('no electric') ||
      combined.includes('water disconnect') || combined.includes('water shutoff')) {
    return { category: 'Utility', priority: 'high', original: violation };
  }
  
  // MEDIUM PRIORITY - System Failures / Significant Issues
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
  
  // LOW PRIORITY - Maintenance / Exterior
  if (combined.includes('paint') || combined.includes('siding') || 
      combined.includes('fence') || combined.includes('grass') ||
      combined.includes('weeds') || combined.includes('debris')) {
    return { category: 'Exterior', priority: 'low', original: violation };
  }
  
  if (combined.includes('window') || combined.includes('door') ||
      combined.includes('screen') || combined.includes('gutter')) {
    return { category: 'Exterior', priority: 'low', original: violation };
  }
  
  // Default based on keywords
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

// Generate context-aware insight based on detected signals
// Uses neutral enforcement/compliance language - NO investor/opportunity language
function generateSignalBasedInsight(
  signals: string[],
  intelligence: PropertyIntelligence,
  classified: ViolationWithPriority[]
): string {
  const insights: string[] = [];
  
  // Extended enforcement duration context
  if (signals.includes('extended_enforcement')) {
    insights.push('Active enforcement exceeds 180-day threshold');
  }
  
  // Repeat activity context
  if (signals.includes('recurring_enforcement')) {
    insights.push('Property shows pattern of recurring municipal citations');
  } else if (signals.includes('multiple_citations')) {
    insights.push('Multiple enforcement actions documented');
  }
  
  // Multi-agency context
  if (signals.includes('coordinated_enforcement')) {
    insights.push('Cross-department enforcement activity detected');
  } else if (signals.includes('multi_department')) {
    insights.push('Multiple municipal agencies involved');
  }
  
  // Escalation context
  if (signals.includes('enforcement_escalation')) {
    insights.push('Case has been escalated to higher enforcement level');
  }
  
  // Vacancy context
  if (signals.includes('vacancy_citation')) {
    insights.push('Vacancy or abandonment citation on record');
  }
  
  // Fire/Structural
  if (signals.includes('fire_citation')) {
    insights.push('Fire-related enforcement action documented');
  }
  if (signals.includes('structural_citation')) {
    insights.push('Structural safety citation issued');
  }
  
  // Utility enforcement
  if (signals.includes('utility_enforcement')) {
    insights.push('Utility service enforcement noted');
  }
  
  // Default based on priority level
  if (insights.length === 0) {
    const highPriorityCount = classified.filter(v => v.priority === 'high').length;
    const mediumPriorityCount = classified.filter(v => v.priority === 'medium').length;
    
    if (highPriorityCount > 0) {
      insights.push('High-priority enforcement actions on record');
    } else if (mediumPriorityCount > 0) {
      insights.push('Active compliance matters pending resolution');
    } else if (intelligence.total_violations > 0) {
      insights.push('Routine maintenance citations documented');
    } else {
      insights.push('Limited enforcement activity on file');
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
