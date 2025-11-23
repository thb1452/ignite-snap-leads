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

      // Generate AI insight
      const violationSummary = violations
        .map(v => `${v.violation_type} (${v.status}${v.days_open ? `, ${v.days_open} days open` : ''})`)
        .join("; ");

      const prompt = `Analyze this property violation data and provide a concise, actionable insight for a real estate investor in 1-2 sentences:

Property: ${property.address}, ${property.city}
Violations: ${violationSummary}

Focus on:
- Investment opportunity level (high/medium/low)
- Key concerns or selling points
- Urgency indicators

Keep it brief and actionable.`;

      try {
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: "You are a real estate investment analyst. Provide brief, actionable insights about properties based on code violation data. Focus on opportunity level and key concerns."
              },
              {
                role: "user",
                content: prompt
              }
            ],
          }),
        });

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          console.error(`AI API error for property ${property.id}:`, aiResponse.status, errorText);
          continue;
        }

        const aiData = await aiResponse.json();
        const insight = aiData.choices?.[0]?.message?.content || null;

        // Calculate snap score based on violations
        const snapScore = calculateSnapScore(violations);

        updates.push({
          id: property.id,
          snap_insight: insight,
          snap_score: snapScore,
        });

      } catch (error) {
        console.error(`Error generating insight for property ${property.id}:`, error);
      }
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

function calculateSnapScore(violations: Violation[]): number {
  let score = 0;
  const violationCount = violations.length;

  // Base score on violation count (0-40 points)
  score += Math.min(violationCount * 8, 40);

  // Add points for violation severity (0-30 points)
  const highSeverityTypes = ["junk", "inoperable", "premise", "trash", "debris", "rubbish"];
  const highSeverityCount = violations.filter(v => 
    highSeverityTypes.some(type => v.violation_type.toLowerCase().includes(type))
  ).length;
  score += Math.min(highSeverityCount * 10, 30);

  // Add points for open violations (0-20 points)
  const openCount = violations.filter(v => 
    v.status?.toLowerCase().includes("open") || 
    v.status?.toLowerCase().includes("pending")
  ).length;
  score += Math.min(openCount * 5, 20);

  // Add points for long-standing violations (0-10 points)
  const oldViolations = violations.filter(v => v.days_open && v.days_open > 90).length;
  score += Math.min(oldViolations * 5, 10);

  return Math.min(score, 100);
}
