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
}

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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
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
        violations (
          violation_type,
          status,
          days_open
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

    const updates = [];

    // Process each property
    for (const property of properties) {
      const violations = property.violations as Violation[];
      
      if (!violations || violations.length === 0) {
        continue;
      }

      // Generate safe, compliant insight using rule-based template
      const snapScore = calculateSnapScore(violations);
      const insight = generateSafeInsight(violations);
      
      updates.push({
        id: property.id,
        snap_insight: insight,
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

// Define what counts as an "open" violation
const STATUS_OPEN_KEYWORDS = [
  "open",
  "pending",
  "in progress",
  "referred",
  "board",
  "hearing",
  "lien",
];

// Safe, compliant scoring based on violation data only
function calculateSnapScore(violations: Violation[]): number {
  let rawScore = 0;
  
  // Count open violations using expanded keyword list
  const openViolations = violations.filter(v => {
    const status = (v.status || "").toLowerCase();
    return STATUS_OPEN_KEYWORDS.some(kw => status.includes(kw));
  });
  const openCount = openViolations.length;
  
  // Base score on open violations (0-7 points)
  if (openCount === 0) rawScore += 1;
  else if (openCount === 1) rawScore += 3;
  else if (openCount === 2) rawScore += 5;
  else if (openCount >= 3) rawScore += 7;
  
  // Calculate severity score by scanning descriptions
  let severityScore = 0;
  const highSeverityKeywords = [
    'unsafe', 'nuisance structure', 'condemned', 'uninhabitable', 
    'electrical', 'fire', 'sewage', 'raw sewage', 'mold', 'roof failure'
  ];
  const mediumSeverityKeywords = [
    'multiple dwellings', 'occupied rv', 'unpermitted dwelling',
    'unpermitted addition', 'junk vehicles', 'trash', 'accumulation',
    'debris', 'boarded'
  ];
  const lowSeverityKeywords = [
    'tall grass', 'weeds', 'overgrown', 'trash can',
    'sign', 'fence', 'parking', 'noise'
  ];
  
  violations.forEach(v => {
    const desc = (v.violation_type || '').toLowerCase();
    if (highSeverityKeywords.some(kw => desc.includes(kw))) {
      severityScore += 3;
    } else if (mediumSeverityKeywords.some(kw => desc.includes(kw))) {
      severityScore += 2;
    } else if (lowSeverityKeywords.some(kw => desc.includes(kw))) {
      severityScore += 1;
    }
  });
  
  // Add compressed severity (max 3 points)
  rawScore += Math.min(severityScore / 3, 3);
  
  // Add duration pressure (0-2 points) - only for open violations
  if (openCount > 0) {
    const openWithDays = openViolations.filter(v => v.days_open !== null && v.days_open !== undefined);
    if (openWithDays.length > 0) {
      const avgOpenDuration = openWithDays.reduce((sum, v) => sum + (v.days_open || 0), 0) / openWithDays.length;
      
      if (avgOpenDuration > 180) rawScore += 2;
      else if (avgOpenDuration > 90) rawScore += 1;
    }
  }
  
  // Escalation bonus (0-2 points)
  const escalationKeywords = ['referred to code board', 'hearing', 'board', 'lien'];
  const hasEscalation = violations.some(v => {
    const status = (v.status || '').toLowerCase();
    return escalationKeywords.some(kw => status.includes(kw));
  });
  if (hasEscalation) rawScore += 2;
  
  // Clamp to 1-10 scale
  return Math.max(1, Math.min(10, Math.round(rawScore)));
}

// Generate safe, compliant insight based on violation data
function generateSafeInsight(violations: Violation[]): string {
  // Use same open detection logic
  const openViolations = violations.filter(v => {
    const status = (v.status || "").toLowerCase();
    return STATUS_OPEN_KEYWORDS.some(kw => status.includes(kw));
  });
  const openCount = openViolations.length;
  
  // Extract unique violation categories from open violations
  const categories = new Set<string>();
  openViolations.forEach(v => {
    const rawType = v.violation_type || (v as any).category || '';
    if (rawType) {
      const cleaned = rawType
        .toLowerCase()
        .replace(/[_-]/g, ' ')
        .trim();
      categories.add(cleaned);
    }
  });
  
  // Calculate rough timeframe from oldest open violation
  const oldestDays = openViolations.length > 0 
    ? Math.max(...openViolations.map(v => v.days_open || 0))
    : 0;
  let timeframe = "recent months";
  if (oldestDays > 180) timeframe = "over a year";
  else if (oldestDays > 90) timeframe = "the last 6+ months";
  
  // Check for escalation
  const escalationKeywords = ['referred to code board', 'hearing', 'board', 'lien'];
  const hasEscalation = violations.some(v => {
    const status = (v.status || '').toLowerCase();
    return escalationKeywords.some(kw => status.includes(kw));
  });
  
  // Build insight based on situation
  if (openCount === 0) {
    return `This property has ${violations.length} historical code enforcement case(s). All known violations are currently marked resolved.`;
  }
  
  // Format categories list
  const categoryList = Array.from(categories).slice(0, 3);
  let categoryPhrase = '';
  
  if (categoryList.length > 0) {
    if (categoryList.length === 1) {
      categoryPhrase = ` related to ${categoryList[0]}`;
    } else if (categoryList.length === 2) {
      categoryPhrase = ` including ${categoryList[0]} and ${categoryList[1]}`;
    } else {
      categoryPhrase = ` including ${categoryList.slice(0, -1).join(', ')}, and ${categoryList[categoryList.length - 1]}`;
    }
  }
  
  if (hasEscalation) {
    return `This property has ${openCount} open code enforcement case(s) over ${timeframe}${categoryPhrase}, with at least one case escalated to code board / lien proceedings. This indicates sustained enforcement pressure to resolve the violations.`;
  }
  
  return `This property has ${openCount} open code enforcement case(s) over ${timeframe}${categoryPhrase}. The pattern suggests ongoing maintenance and repair pressure from the local code office.`;
}
