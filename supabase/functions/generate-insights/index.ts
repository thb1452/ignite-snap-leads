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

// Safe, compliant scoring based on violation data only
function calculateSnapScore(violations: Violation[]): number {
  let rawScore = 0;
  
  // Count open violations
  const openCount = violations.filter(v => 
    v.status?.toLowerCase().includes("open") || 
    v.status?.toLowerCase().includes("pending")
  ).length;
  
  // Base score on open violations (0-7 points)
  if (openCount === 0) rawScore += 1;
  else if (openCount === 1) rawScore += 3;
  else if (openCount === 2) rawScore += 5;
  else if (openCount >= 3) rawScore += 7;
  
  // Calculate severity score by scanning descriptions
  let severityScore = 0;
  const highSeverityKeywords = [
    'unsafe', 'nuisance structure', 'condemned', 'uninhabitable', 
    'electrical', 'fire', 'sewage', 'mold'
  ];
  const mediumSeverityKeywords = [
    'multiple dwellings', 'occupied rv', 'unpermitted dwelling',
    'junk vehicles', 'trash', 'accumulation'
  ];
  const lowSeverityKeywords = [
    'tall grass', 'weeds', 'trash control', 'sign', 'fence'
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
  
  // Add duration pressure (0-2 points)
  if (openCount > 0) {
    const avgOpenDuration = violations
      .filter(v => v.days_open !== null)
      .reduce((sum, v) => sum + (v.days_open || 0), 0) / 
      violations.filter(v => v.days_open !== null).length;
    
    if (avgOpenDuration > 180) rawScore += 2;
    else if (avgOpenDuration > 90) rawScore += 1;
  }
  
  // Clamp to 1-10 scale
  return Math.max(1, Math.min(10, Math.round(rawScore)));
}

// Generate safe, compliant insight based on violation data
function generateSafeInsight(violations: Violation[]): string {
  const openCount = violations.filter(v => 
    v.status?.toLowerCase().includes("open") || 
    v.status?.toLowerCase().includes("pending")
  ).length;
  
  // Extract top violation keywords (safe descriptors)
  const topKeywords: string[] = [];
  const keywordMap = {
    'unsafe': 'unsafe structure',
    'nuisance structure': 'nuisance structure',
    'condemned': 'condemned structure',
    'unpermitted': 'unpermitted work',
    'multiple dwellings': 'multiple dwellings',
    'junk vehicles': 'junk vehicles',
    'trash': 'trash accumulation',
    'land disturbance': 'land disturbance'
  };
  
  violations.forEach(v => {
    const desc = (v.violation_type || '').toLowerCase();
    for (const [key, label] of Object.entries(keywordMap)) {
      if (desc.includes(key) && !topKeywords.includes(label)) {
        topKeywords.push(label);
        if (topKeywords.length >= 2) return;
      }
    }
  });
  
  // Calculate rough timeframe
  const oldestDays = Math.max(...violations.map(v => v.days_open || 0));
  let timeframe = "recent months";
  if (oldestDays > 365) timeframe = "over a year";
  else if (oldestDays > 180) timeframe = "the last 6+ months";
  else if (oldestDays > 90) timeframe = "the last several months";
  
  // Build safe template-based insight
  if (openCount === 0) {
    return `This property has ${violations.length} historical code enforcement case(s). All violations have been resolved.`;
  }
  
  const keywordPhrase = topKeywords.length > 0 
    ? `, including ${topKeywords.join(' and ')}`
    : '';
  
  return `This property has ${openCount} open code enforcement case(s) over ${timeframe}${keywordPhrase}. This pattern suggests ongoing compliance and repair pressure, which may increase openness to solutions that help resolve the violations.`;
}
