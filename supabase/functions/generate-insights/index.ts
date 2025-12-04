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

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

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
        violations (
          violation_type,
          status,
          days_open,
          opened_date
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

    // Build address frequency map for repeat detection
    const addressCounts = new Map<string, number>();
    properties.forEach(p => {
      const normalizedAddr = normalizeAddress(p.address);
      addressCounts.set(normalizedAddr, (addressCounts.get(normalizedAddr) || 0) + 1);
    });

    const updates = [];

    // Process each property
    for (const property of properties) {
      const violations = property.violations as Violation[];
      const normalizedAddr = normalizeAddress(property.address);
      const isRepeatAddress = (addressCounts.get(normalizedAddr) || 0) > 1;
      
      // Generate score and insight even for properties with no violations
      const snapScore = calculateSnapScoreV1(violations || [], isRepeatAddress);
      const insight = generateInsightV1(violations || [], isRepeatAddress);
      
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

    console.log(`Generated insights for ${updates.length} properties`);

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

// Normalize address for comparison
function normalizeAddress(address: string): string {
  return address.toLowerCase().trim().replace(/\s+/g, ' ');
}

// Status classification
function isOpenStatus(status: string): boolean {
  const s = (status || "").toLowerCase();
  return s.includes("open") || s.includes("pending") || s.includes("in progress") ||
         s.includes("referred") || s.includes("board") || s.includes("hearing") ||
         s.includes("active") || s.includes("new");
}

function isClosedStatus(status: string): boolean {
  const s = (status || "").toLowerCase();
  return s.includes("closed") || s.includes("resolved") || s.includes("complete") ||
         s.includes("complied") || s.includes("dismissed") || s.includes("abated");
}

// Category classification
function isUnsafeStructuralExterior(violationType: string): boolean {
  const vt = (violationType || "").toLowerCase();
  return vt.includes("unsafe") || vt.includes("structure") || vt.includes("structural") ||
         vt.includes("exterior") || vt.includes("roof") || vt.includes("foundation") ||
         vt.includes("condemned") || vt.includes("nuisance structure") || vt.includes("fire") ||
         vt.includes("electrical") || vt.includes("plumbing");
}

function isInteriorUnsanitary(violationType: string): boolean {
  const vt = (violationType || "").toLowerCase();
  return vt.includes("interior") || vt.includes("unsanitary") || vt.includes("mold") ||
         vt.includes("sewage") || vt.includes("trash") || vt.includes("debris") ||
         vt.includes("accumulation") || vt.includes("maintenance");
}

function isGrassAnimals(violationType: string): boolean {
  const vt = (violationType || "").toLowerCase();
  return vt.includes("grass") || vt.includes("weed") || vt.includes("overgrown") ||
         vt.includes("animal") || vt.includes("pet") || vt.includes("vegetation");
}

// SNAP Score v1 - Rule-based weights (normalized to 0-100)
function calculateSnapScoreV1(violations: Violation[], isRepeatAddress: boolean): number {
  let rawScore = 0;
  
  for (const v of violations) {
    // Status weights
    if (isOpenStatus(v.status)) {
      rawScore += 20;
    } else if (isClosedStatus(v.status)) {
      rawScore -= 15;
    }
    
    // Category weights
    if (isUnsafeStructuralExterior(v.violation_type)) {
      rawScore += 30;
    } else if (isInteriorUnsanitary(v.violation_type)) {
      rawScore += 20;
    } else if (isGrassAnimals(v.violation_type)) {
      rawScore += 5;
    }
  }
  
  // Repeat address bonus
  if (isRepeatAddress) {
    rawScore += 25;
  }
  
  // Normalize to 0-100 scale
  // Assuming max raw score around 200 (4 high-severity open violations + repeat)
  const normalized = Math.round((rawScore / 200) * 100);
  
  // Clamp to 0-100
  return Math.max(0, Math.min(100, normalized));
}

// Generate insight v1 - Rule-based sentences
function generateInsightV1(violations: Violation[], isRepeatAddress: boolean): string {
  if (violations.length === 0) {
    return "No violation records found for this property.";
  }
  
  const insights: string[] = [];
  
  // Check for open violations
  const openViolations = violations.filter(v => isOpenStatus(v.status));
  if (openViolations.length > 0) {
    insights.push(`Active violation${openViolations.length > 1 ? 's' : ''} on record`);
  }
  
  // Check for property distress categories
  const hasDistressCategory = violations.some(v => 
    isUnsafeStructuralExterior(v.violation_type) || 
    isInteriorUnsanitary(v.violation_type)
  );
  if (hasDistressCategory) {
    insights.push("Likely property distress");
  }
  
  // Check for recent activity (opened within 60 days)
  const now = new Date();
  const hasRecentActivity = violations.some(v => {
    if (!v.opened_date) return false;
    const openedDate = new Date(v.opened_date);
    const daysSince = Math.floor((now.getTime() - openedDate.getTime()) / (1000 * 60 * 60 * 24));
    return daysSince <= 60;
  });
  if (hasRecentActivity) {
    insights.push("Recent activity");
  }
  
  // Check for repeat enforcement
  if (isRepeatAddress) {
    insights.push("Repeat enforcement history");
  }
  
  // Build final insight string
  if (insights.length === 0) {
    // Fallback for properties with only closed/minor violations
    const closedCount = violations.filter(v => isClosedStatus(v.status)).length;
    if (closedCount > 0) {
      return `${closedCount} historical violation${closedCount > 1 ? 's' : ''} resolved. Property appears compliant.`;
    }
    return `${violations.length} violation record${violations.length > 1 ? 's' : ''} on file.`;
  }
  
  // Format as 1-2 AI-style sentences
  return insights.join(". ") + ".";
}
