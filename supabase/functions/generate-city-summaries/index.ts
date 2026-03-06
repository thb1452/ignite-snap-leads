/**
 * Generate AI City Summaries — Content Moat Engine
 * 
 * Generates unique ~200-word enforcement intelligence summaries per jurisdiction
 * using Lovable AI (Gemini 3 Flash). Stores results in jurisdictions.ai_summary.
 * 
 * Modes:
 *   - single: Generate for one jurisdiction by ID
 *   - batch:  Process a batch of jurisdictions missing summaries
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const BATCH_SIZE = 10;
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface JurisdictionRow {
  id: string;
  city: string;
  state: string;
  county: string | null;
  enforcement_profile: Record<string, unknown> | null;
}

function buildPrompt(j: JurisdictionRow, propertyCount: number): string {
  const profile = j.enforcement_profile || {};
  const strictness = (profile.strictness as string) || "unknown";
  const avgDays = (profile.avg_days_to_close as number) || 0;
  const totalCited = (profile.total_properties_cited as number) || 0;
  const avgViolations = (profile.avg_violations_per_property as number) || 0;

  return `Write a unique 150-200 word enforcement intelligence summary for real estate investors about ${j.city}, ${j.state}${j.county ? ` (${j.county} County)` : ''}.

Use this data:
- Properties tracked: ${propertyCount}
- Properties cited: ${totalCited}
- Enforcement strictness: ${strictness}
- Average days to close a violation: ${avgDays}
- Average violations per property: ${avgViolations.toFixed(1)}

Requirements:
- Write in a professional, data-driven tone for real estate investors
- Mention specific enforcement patterns, timelines, and what they mean for investment opportunities
- Include actionable takeaways (e.g. "properties here tend to linger in violation status for X days, creating extended acquisition windows")
- Do NOT use generic filler. Every sentence must reference the city's specific data
- Do NOT mention water shutoffs unless the data explicitly indicates water enforcement
- Do NOT use markdown formatting, just plain text paragraphs
- Keep it between 150-200 words exactly`;
}

async function generateSummary(
  apiKey: string,
  j: JurisdictionRow,
  propertyCount: number
): Promise<string | null> {
  try {
    const response = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: "You are a real estate enforcement intelligence analyst. Write concise, data-driven city summaries for investors. No fluff, no generic statements. Every sentence must be grounded in the provided data.",
          },
          { role: "user", content: buildPrompt(j, propertyCount) },
        ],
        max_tokens: 400,
        temperature: 0.6,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[city-summaries] AI error for ${j.city}: status=${response.status} body=${errText}`);
      return null;
    }

    const rawText = await response.text();
    console.log(`[city-summaries] Raw AI response for ${j.city}: ${rawText.substring(0, 200)}`);
    
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      console.error(`[city-summaries] Failed to parse AI response for ${j.city}`);
      return null;
    }
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    // Truncate to ~280 chars for storage consistency (keep full sentences)
    // Actually, keep full summary since these are for SEO content
    return content;
  } catch (err) {
    console.error(`[city-summaries] Error generating for ${j.city}:`, err);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const { mode = "batch", jurisdictionId, batchSize = BATCH_SIZE, autoResume = true } = body;

    let jurisdictions: JurisdictionRow[] = [];

    if (mode === "single" && jurisdictionId) {
      const { data, error } = await supabase
        .from("jurisdictions")
        .select("id, city, state, county, enforcement_profile")
        .eq("id", jurisdictionId)
        .single();
      if (error) throw error;
      jurisdictions = [data];
    } else {
      // Batch: find jurisdictions without summaries
      const { data, error } = await supabase
        .from("jurisdictions")
        .select("id, city, state, county, enforcement_profile")
        .is("ai_summary", null)
        .order("city")
        .limit(batchSize);
      if (error) throw error;
      jurisdictions = data || [];
    }

    if (jurisdictions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, remaining: 0, message: "All jurisdictions have summaries" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[city-summaries] Processing ${jurisdictions.length} jurisdictions`);

    let processed = 0;
    let failed = 0;

    // Process sequentially with throttling to respect rate limits
    for (const j of jurisdictions) {
      // Get property count for this jurisdiction
      const { count } = await supabase
        .from("properties")
        .select("*", { count: "exact", head: true })
        .eq("jurisdiction_id", j.id);

      const summary = await generateSummary(LOVABLE_API_KEY, j, count || 0);

      if (summary) {
        const { error: updateError } = await supabase
          .from("jurisdictions")
          .update({ ai_summary: summary })
          .eq("id", j.id);

        if (updateError) {
          console.error(`[city-summaries] Failed to save summary for ${j.city}:`, updateError);
          failed++;
        } else {
          processed++;
          console.log(`[city-summaries] ✓ ${j.city}, ${j.state} (${summary.length} chars)`);
        }
      } else {
        failed++;
      }

      // 1.5s throttle between AI calls
      if (jurisdictions.indexOf(j) < jurisdictions.length - 1) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    // Check remaining
    const { count: remaining } = await supabase
      .from("jurisdictions")
      .select("*", { count: "exact", head: true })
      .is("ai_summary", null);

    // Auto-resume if more remain
    if (autoResume && (remaining || 0) > 0 && processed > 0) {
      const continueTask = async () => {
        await new Promise(r => setTimeout(r, 2000));
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/generate-city-summaries`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ mode: "batch", batchSize, autoResume }),
          });
          console.log(`[city-summaries] Auto-resume triggered, ${remaining} remaining`);
        } catch (err) {
          console.error("[city-summaries] Auto-resume failed:", err);
        }
      };

      const runtime = (globalThis as any).EdgeRuntime;
      if (runtime?.waitUntil) {
        runtime.waitUntil(continueTask());
      } else {
        continueTask().catch(console.error);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        failed,
        remaining: remaining || 0,
        autoResuming: autoResume && (remaining || 0) > 0 && processed > 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[city-summaries] Fatal:", error);

    if (error instanceof Error && error.message.includes("rate limit")) {
      return new Response(
        JSON.stringify({ error: "Rate limited, please try again later" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
