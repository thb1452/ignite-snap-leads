/**
 * SECURITY CRITICAL: This function processes raw_description (raw city notes)
 * to generate investor-safe summaries. raw_description is NEVER exposed to users.
 * Only snap_insight (the AI-generated summary) is shown in the UI.
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

// The exact prompt from the build brief
const SNAP_INSIGHT_PROMPT = `You are Snap Insight, a real estate intelligence assistant.

Your job is to convert raw, messy city property condition notes into a short, neutral, investor-safe property condition summary.

RULES:
- Output 1–2 short sentences only.
- Max 280 characters.
- Do NOT mention:
  - The city
  - Inspectors
  - Violations
  - Citations
  - Fines
  - Legal process
  - Police
  - Fire department
  - Tenants or occupants
  - Death, hoarding, disputes, or personal behavior
- Do NOT copy or paraphrase enforcement language.
- Use neutral, factual, non-accusatory language only.
- You MAY reference:
  - Exterior condition
  - Structural maintenance
  - Safety-related physical condition
  - Signs of vacancy
  - General habitability uncertainty
  - Fire-related damage ONLY as "fire-related damage observed"

STRUCTURE:
[Property condition] + [Impact signal] + [Opportunity cue]`;

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
      
      let snapInsight: string;
      
      // Add validation before making API call
      if (!rawDescriptions || rawDescriptions.length === 0) {
        console.log(`[generate-insights] No raw descriptions for property ${property.id}, using fallback`);
        snapInsight = generateFallbackInsight(violations);
      } else if (!LOVABLE_API_KEY) {
        console.log(`[generate-insights] No LOVABLE_API_KEY set, using fallback`);
        snapInsight = generateFallbackInsight(violations);
      } else {
        try {
          snapInsight = await generateAIInsight(rawDescriptions, violationTypes, LOVABLE_API_KEY);
        } catch (aiError) {
          console.error(`[generate-insights] AI error for ${property.id}:`, aiError);
          // Fallback to rule-based insight
          snapInsight = generateFallbackInsight(violations);
        }
      }
      
      // Calculate snap score based on detected signals in the summary and violation types
      const snapScore = calculateSnapScore(snapInsight, violationTypes, violations);
      
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

// Fallback rule-based insight when AI is not available
function generateFallbackInsight(violations: Violation[]): string {
  if (violations.length === 0) {
    return "No violation records found for this property.";
  }
  
  const insights: string[] = [];
  
  // Check for open violations
  const openViolations = violations.filter(v => isOpenStatus(v.status));
  if (openViolations.length > 0) {
    insights.push(`Active condition${openViolations.length > 1 ? 's' : ''} noted`);
  }
  
  // Check for structural/exterior issues
  const hasStructural = violations.some(v => 
    isStructuralDamage(v.violation_type) || isExteriorIssue(v.violation_type)
  );
  if (hasStructural) {
    insights.push("Exterior maintenance opportunities");
  }
  
  // Check for fire-related
  const hasFireDamage = violations.some(v => isFireDamage(v.violation_type));
  if (hasFireDamage) {
    insights.push("Fire-related damage observed");
  }
  
  // Check for vacancy signals
  const hasVacancy = violations.some(v => isVacancySignal(v.violation_type));
  if (hasVacancy) {
    insights.push("Signs of vacancy");
  }
  
  if (insights.length === 0) {
    return "Property condition requires further assessment.";
  }
  
  return insights.join(". ") + ".";
}

// Calculate snap score based on detected signals (0-100)
function calculateSnapScore(insight: string, violationType: string, violations: Violation[]): number {
  let score = 0;
  const combined = `${insight} ${violationType}`.toLowerCase();
  
  // Signal detection from build brief
  if (isDeferredMaintenance(combined)) score += 20;
  if (isStructuralDamage(combined)) score += 25;
  if (isFireDamage(combined)) score += 40;
  if (isVacancySignal(combined)) score += 20;
  if (isUtilityRisk(combined)) score += 15;
  if (isMultiUnit(combined)) score += 10;
  if (isSafetyExposure(combined)) score += 10;
  if (isRepeatExteriorIssues(violations)) score += 15;
  
  // Cap at 100
  return Math.min(100, score);
}

// Signal detection functions
function isOpenStatus(status: string): boolean {
  const s = (status || "").toLowerCase();
  return s.includes("open") || s.includes("pending") || s.includes("in progress") ||
         s.includes("referred") || s.includes("board") || s.includes("hearing") ||
         s.includes("active") || s.includes("new");
}

function isDeferredMaintenance(text: string): boolean {
  return text.includes("deferred") || text.includes("maintenance") || 
         text.includes("neglect") || text.includes("deteriorat") ||
         text.includes("disrepair") || text.includes("worn");
}

function isStructuralDamage(text: string): boolean {
  return text.includes("structur") || text.includes("foundation") || 
         text.includes("roof") || text.includes("wall") ||
         text.includes("collapse") || text.includes("unsafe") ||
         text.includes("condemned");
}

function isFireDamage(text: string): boolean {
  return text.includes("fire") || text.includes("burn") || 
         text.includes("smoke") || text.includes("charred");
}

function isVacancySignal(text: string): boolean {
  return text.includes("vacant") || text.includes("abandon") || 
         text.includes("unoccup") || text.includes("board") ||
         text.includes("empty") || text.includes("secure");
}

function isUtilityRisk(text: string): boolean {
  return text.includes("electric") || text.includes("plumb") || 
         text.includes("water") || text.includes("gas") ||
         text.includes("sewage") || text.includes("utility");
}

function isMultiUnit(text: string): boolean {
  return text.includes("multi") || text.includes("unit") || 
         text.includes("apartment") || text.includes("duplex") ||
         text.includes("complex");
}

function isSafetyExposure(text: string): boolean {
  return text.includes("safety") || text.includes("hazard") || 
         text.includes("danger") || text.includes("risk") ||
         text.includes("health");
}

function isExteriorIssue(text: string): boolean {
  const t = (text || "").toLowerCase();
  return t.includes("exterior") || t.includes("facade") || 
         t.includes("siding") || t.includes("paint") ||
         t.includes("window") || t.includes("door");
}

function isRepeatExteriorIssues(violations: Violation[]): boolean {
  const exteriorCount = violations.filter(v => 
    isExteriorIssue(v.violation_type)
  ).length;
  return exteriorCount >= 2;
}
