/**
 * SECURITY CRITICAL: Snap Insight Generation
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
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Violation {
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
        violations (
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
      const violations = property.violations as Violation[];
      
      // Collect raw descriptions for AI processing
      const rawDescriptions = violations
        .map(v => v.raw_description)
        .filter(d => d && d.trim())
        .join('\n\n');
      
      // Collect violation types for scoring
      const violationTypes = violations.map(v => v.violation_type || '').join(' ');
      
      // Classify violations with severity
      const classifiedViolations = violations.map(v => classifyViolation(v));
      
      let snapInsight: string;
      
      // Add validation before making API call
      if (!rawDescriptions || rawDescriptions.length === 0) {
        console.log(`[generate-insights] No raw descriptions for property ${property.id}, using fallback`);
        snapInsight = generateFallbackInsight(violations, classifiedViolations);
      } else if (!LOVABLE_API_KEY) {
        console.log(`[generate-insights] No LOVABLE_API_KEY set, using fallback`);
        snapInsight = generateFallbackInsight(violations, classifiedViolations);
      } else {
        try {
          snapInsight = await generateAIInsight(rawDescriptions, violationTypes, LOVABLE_API_KEY);
        } catch (aiError) {
          console.error(`[generate-insights] AI error for ${property.id}:`, aiError);
          // Fallback to rule-based insight
          snapInsight = generateFallbackInsight(violations, classifiedViolations);
        }
      }
      
      // Calculate enhanced snap score
      const snapScore = calculateEnhancedSnapScore(snapInsight, violations, classifiedViolations);
      
      updates.push({
        id: property.id,
        snap_insight: snapInsight,
        snap_score: snapScore,
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

// Enhanced fallback insight with severity awareness
function generateFallbackInsight(violations: Violation[], classified: ViolationWithSeverity[]): string {
  if (violations.length === 0) {
    return "No violation records found for this property.";
  }
  
  const insights: string[] = [];
  
  // Check for severe issues first
  const severeIssues = classified.filter(v => v.severity === 'severe');
  if (severeIssues.length > 0) {
    const categories = [...new Set(severeIssues.map(v => v.category))];
    if (categories.includes('Fire')) {
      insights.push("Fire-related damage observed");
    }
    if (categories.includes('Structural')) {
      insights.push("Significant structural concerns identified");
    }
    if (categories.includes('Utility')) {
      insights.push("Critical utility issues noted");
    }
  }
  
  // Check for moderate issues
  const moderateIssues = classified.filter(v => v.severity === 'moderate');
  if (moderateIssues.length > 0) {
    const hasVacancy = moderateIssues.some(v => v.category === 'Vacancy');
    const hasSafety = moderateIssues.some(v => v.category === 'Safety');
    
    if (hasVacancy) {
      insights.push("Signs of vacancy or abandonment");
    }
    if (hasSafety) {
      insights.push("Safety-related conditions present");
    }
  }
  
  // Check for chronic non-compliance (repeat violations)
  if (violations.length >= 3) {
    insights.push("Pattern of chronic non-compliance suggests owner capacity constraints");
  } else if (violations.length > 1) {
    insights.push("Multiple condition issues noted");
  }
  
  // Check for long-standing issues
  const oldestDaysOpen = Math.max(...violations.map(v => v.days_open || 0));
  if (oldestDaysOpen > 180) {
    insights.push("Extended non-remediation period indicates potential distress");
  } else if (oldestDaysOpen > 90) {
    insights.push("Prolonged maintenance deferral observed");
  }
  
  // Default
  if (insights.length === 0) {
    const minorCount = classified.filter(v => v.severity === 'minor').length;
    if (minorCount > 0) {
      return "Property shows deferred maintenance. Value-add opportunity potential.";
    }
    return "Property condition requires further assessment.";
  }
  
  // Combine insights (max 280 chars)
  let result = insights.join(". ") + ".";
  if (result.length > 280) {
    result = insights.slice(0, 2).join(". ") + ".";
  }
  
  return result;
}

// Enhanced scoring algorithm with time-based weighting and severity
function calculateEnhancedSnapScore(
  insight: string, 
  violations: Violation[], 
  classified: ViolationWithSeverity[]
): number {
  let score = 0;
  const combined = insight.toLowerCase();
  
  // ====== TIME-BASED DISTRESS (older = worse) ======
  // +5 points per month open, capped at 30
  const maxDaysOpen = Math.max(...violations.map(v => v.days_open || 0), 0);
  const monthsOpen = Math.floor(maxDaysOpen / 30);
  score += Math.min(monthsOpen * 5, 30);
  
  // ====== SEVERITY-BASED SCORING ======
  // Severe issues
  const severeCount = classified.filter(v => v.severity === 'severe').length;
  if (severeCount > 0) {
    // First severe issue: 40 points, each additional: 15 points
    score += 40 + (severeCount - 1) * 15;
  }
  
  // Moderate issues
  const moderateCount = classified.filter(v => v.severity === 'moderate').length;
  score += moderateCount * 15;
  
  // Minor issues
  const minorCount = classified.filter(v => v.severity === 'minor').length;
  score += Math.min(minorCount * 5, 15); // Cap minor contribution at 15
  
  // ====== MULTI-DEPARTMENT ENFORCEMENT ======
  const uniqueCategories = [...new Set(classified.map(v => v.category))];
  if (uniqueCategories.length >= 3) {
    score += 25; // 3+ violation types = serious multi-system failure
  } else if (uniqueCategories.length === 2) {
    score += 10; // 2 violation types
  }
  
  // ====== REPEAT OFFENSE BONUS ======
  // More violations = more distress
  if (violations.length >= 5) {
    score += 25;
  } else if (violations.length >= 3) {
    score += 15;
  } else if (violations.length >= 2) {
    score += 5;
  }
  
  // ====== STATUS MULTIPLIERS ======
  const statuses = violations.map(v => (v.status || '').toLowerCase());
  
  if (statuses.some(s => s.includes('condemned') || s.includes('legal action') || s.includes('prosecution'))) {
    score += 30; // Serious legal escalation
  } else if (statuses.some(s => s.includes('referred') || s.includes('board') || s.includes('hearing'))) {
    score += 15; // Escalated enforcement
  }
  
  // ====== SPECIFIC SIGNAL DETECTION ======
  // Fire damage (if not already counted via classification)
  if (combined.includes('fire') && severeCount === 0) {
    score += 20;
  }
  
  // Vacancy signals
  if (combined.includes('vacant') || combined.includes('abandon') || combined.includes('unoccup')) {
    score += 10;
  }
  
  // Unsecured structure
  if (combined.includes('unsecured') || combined.includes('open to entry') || combined.includes('boarded')) {
    score += 15;
  }
  
  // Cap at 100
  return Math.min(100, Math.max(0, score));
}
