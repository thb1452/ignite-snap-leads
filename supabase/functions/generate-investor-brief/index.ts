/**
 * GENERATE INVESTOR BRIEF — Edge Function (v2.1)
 *
 * Accepts a property_id, fetches full property + violation + contact data,
 * calls Lovable AI (Gemini 2.5 Pro) to generate a structured investor brief,
 * and returns the brief as JSON.
 *
 * v2.1: Migrated from Anthropic Claude to Lovable AI gateway
 * - Rate limiting: 10 regenerations per property per user per day
 * - Token usage tracking: logs input/output tokens per call
 * - Structured monitoring: latency, status, error tracking
 * - newest_violation_date returned for stale-brief detection
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { sanitizeInsightForStorage } from "../_shared/insightSanitizer.ts";
import { DEAL_STRATEGIST_PROMPT } from "../_shared/dealStrategistPrompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const AI_GATEWAY_URL = "https://api.groq.com/openai/v1/chat/completions";
const AI_MODEL = "llama-3.3-70b-versatile";
const AI_MAX_TOKENS = 1500;
const DAILY_REGEN_LIMIT = 10;

const SYSTEM_PROMPT = DEAL_STRATEGIST_PROMPT;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const headers = { ...corsHeaders, "Content-Type": "application/json" };
  const startTime = Date.now();

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required Supabase environment variables");
    }

    if (!GROQ_API_KEY) {
      console.error("[generate-investor-brief] GROQ_API_KEY not set");
      logMonitoring({ status: "error", error: "missing_api_key", latency_ms: Date.now() - startTime });
      return new Response(
        JSON.stringify({ error: "brief_unavailable" }),
        { status: 500, headers }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify JWT
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      logMonitoring({ status: "auth_error", error: "missing_token", latency_ms: Date.now() - startTime });
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authData?.user) {
      logMonitoring({ status: "auth_error", error: authErr?.message || "invalid_token", latency_ms: Date.now() - startTime });
      return new Response(
        JSON.stringify({ error: "Unauthorized", code: "AUTH_EXPIRED" }),
        { status: 401, headers }
      );
    }

    const userId = authData.user.id;

    // Parse request body
    const { property_id } = await req.json();
    if (!property_id) {
      return new Response(
        JSON.stringify({ error: "property_id is required" }),
        { status: 400, headers }
      );
    }

    console.log("[generate-investor-brief] Processing property:", property_id, "user:", userId);

    // ── Rate Limiting: 10 regenerations per property per user per day ──
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const { count: regenCount } = await supabase
      .from("system_logs")
      .select("*", { count: "exact", head: true })
      .eq("event_type", "investor_brief_generated")
      .eq("user_id", userId)
      .contains("metadata", { property_id })
      .gte("created_at", todayStart.toISOString());

    if ((regenCount ?? 0) >= DAILY_REGEN_LIMIT) {
      console.warn("[generate-investor-brief] Rate limit hit:", userId, property_id, regenCount);
      logMonitoring({ status: "rate_limited", property_id, user_id: userId, latency_ms: Date.now() - startTime });
      return new Response(
        JSON.stringify({
          error: "rate_limit_exceeded",
          message: `Daily regeneration limit reached (${DAILY_REGEN_LIMIT}/day). Try again tomorrow.`,
          limit: DAILY_REGEN_LIMIT,
        }),
        { status: 429, headers }
      );
    }

    // Fetch full property record
    const { data: property, error: propError } = await supabase
      .from("properties")
      .select(`
        id, address, city, state, zip, county,
        snap_score, snap_insight, distress_signals, violation_types,
        open_violations, total_violations, enforcement_type,
        escalated, repeat_offender, multi_department,
        avg_days_open, oldest_violation_date, newest_violation_date,
        last_analyzed_at, last_enforcement_date, opportunity_class
      `)
      .eq("id", property_id)
      .maybeSingle();

    if (propError) {
      console.error("[generate-investor-brief] Error fetching property:", propError);
      logMonitoring({ status: "error", error: "property_fetch_failed", property_id, latency_ms: Date.now() - startTime });
      return new Response(
        JSON.stringify({ error: "brief_unavailable" }),
        { status: 500, headers }
      );
    }

    if (!property) {
      return new Response(
        JSON.stringify({ error: "Property not found" }),
        { status: 404, headers }
      );
    }

    // Fetch all violations for this property
    const { data: violations, error: violError } = await supabase
      .from("violations")
      .select("violation_type, status, raw_description, days_open, opened_date, case_id")
      .eq("property_id", property_id)
      .order("opened_date", { ascending: false });

    if (violError) {
      console.error("[generate-investor-brief] Error fetching violations:", violError);
    }

    const violationRecords = violations || [];

    // Fetch property contacts (optional)
    const { data: contacts } = await supabase
      .from("property_contacts")
      .select("name, phone, email, source")
      .eq("property_id", property_id);

    const contactRecords = contacts || [];

    // Format the property data block
    const userMessage = formatPropertyData(property, violationRecords, contactRecords);

    console.log("[generate-investor-brief] Calling Groq API...");
    const apiStartTime = Date.now();

    // Call Groq API (OpenAI-compatible)
    const aiResponse = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: AI_MAX_TOKENS,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: 0.4,
      }),
    });

    const apiLatency = Date.now() - apiStartTime;

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("[generate-investor-brief] AI Gateway error:", aiResponse.status, errText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "rate_limited", message: "AI rate limit exceeded. Please try again shortly." }),
          { status: 429, headers }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "credits_exhausted", message: "AI credits exhausted. Please add more credits." }),
          { status: 402, headers }
        );
      }

      logMonitoring({
        status: "api_error",
        error: `ai_gateway_${aiResponse.status}`,
        property_id,
        api_latency_ms: apiLatency,
        latency_ms: Date.now() - startTime,
      });
      return new Response(
        JSON.stringify({ error: "brief_unavailable" }),
        { status: 500, headers }
      );
    }

    const aiResult = await aiResponse.json();
    const aiText = aiResult?.choices?.[0]?.message?.content?.trim();

    // ── Token usage tracking ──
    const usage = aiResult?.usage;
    const inputTokens = usage?.prompt_tokens ?? 0;
    const outputTokens = usage?.completion_tokens ?? 0;

    if (!aiText) {
      console.error("[generate-investor-brief] Empty AI response");
      logMonitoring({
        status: "error",
        error: "empty_ai_response",
        property_id,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        api_latency_ms: apiLatency,
        latency_ms: Date.now() - startTime,
      });
      return new Response(
        JSON.stringify({ error: "brief_unavailable" }),
        { status: 500, headers }
      );
    }

    // Parse the AI response into sections
    const brief = parseAIBrief(aiText, property.snap_score, property.newest_violation_date);

    const totalLatency = Date.now() - startTime;

    // ── Log to system_logs for rate limiting + monitoring ──
    await supabase.from("system_logs").insert({
      event_type: "investor_brief_generated",
      user_id: userId,
      metadata: {
        property_id,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
        api_latency_ms: apiLatency,
        total_latency_ms: totalLatency,
        model: AI_MODEL,
        brief_text_preview: brief.brief_text.slice(0, 50),
        snap_score: property.snap_score,
        opportunity_class: property.opportunity_class,
      },
    }).then(({ error }) => {
      if (error) console.error("[generate-investor-brief] Failed to log to system_logs:", error);
    });

    logMonitoring({
      status: "success",
      property_id,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      api_latency_ms: apiLatency,
      latency_ms: totalLatency,
      brief_text_preview: brief.brief_text.slice(0, 30),
    });

    console.log(`[generate-investor-brief] Brief generated for ${property_id} | tokens: ${inputTokens}+${outputTokens} | api: ${apiLatency}ms | total: ${totalLatency}ms`);

    return new Response(JSON.stringify(brief), { headers });

  } catch (error) {
    const totalLatency = Date.now() - startTime;
    console.error("[generate-investor-brief] Fatal error:", error instanceof Error ? error.message : error);
    logMonitoring({ status: "fatal_error", error: error instanceof Error ? error.message : String(error), latency_ms: totalLatency });
    return new Response(
      JSON.stringify({ error: "brief_unavailable" }),
      { status: 500, headers }
    );
  }
});

// ── Structured monitoring log ──
function logMonitoring(data: Record<string, unknown>) {
  console.log(JSON.stringify({ _monitor: "investor_brief", timestamp: new Date().toISOString(), ...data }));
}

function formatPropertyData(
  property: Record<string, any>,
  violations: Record<string, any>[],
  contacts: Record<string, any>[]
): string {
  const lines: string[] = ["PROPERTY DATA:", ""];

  lines.push(`Address: ${property.address}, ${property.city || "not specified"}, ${property.state || ""} ${property.zip || ""}`);
  lines.push(`County: ${property.county || "not specified"}`);
  lines.push(`Snap Score: ${property.snap_score ?? "not yet scored"}`);
  lines.push(`Opportunity Class: ${property.opportunity_class || "unknown"}`);
  lines.push(`Total Violations: ${property.total_violations ?? 0}`);
  lines.push(`Open Violations: ${property.open_violations ?? 0}`);
  lines.push(`Violation Types: ${(property.violation_types || []).join(", ") || "none"}`);
  lines.push(`Distress Signals: ${(property.distress_signals || []).join(", ") || "none"}`);
  lines.push(`Enforcement Type: ${property.enforcement_type === "water_shutoff" ? "water_shutoff" : "standard code violation"}`);
  lines.push(`Repeat Offender: ${property.repeat_offender ?? false}`);
  lines.push(`Multi-Department: ${property.multi_department ?? false}`);
  lines.push(`Escalated: ${property.escalated ?? false}`);
  lines.push(`Avg Days Open: ${property.avg_days_open ?? "unknown"}`);
  lines.push(`Oldest Violation Date: ${property.oldest_violation_date || "unknown"}`);
  lines.push(`Newest Violation Date: ${property.newest_violation_date || "unknown"}`);
  lines.push(`Last Enforcement Date: ${property.last_enforcement_date || "unknown"}`);
  lines.push(`Score Last Updated: ${property.last_analyzed_at || "unknown"}`);
  lines.push(`Existing Snap Insight: ${property.snap_insight || "none"}`);

  lines.push("");
  lines.push(`INDIVIDUAL VIOLATIONS (${violations.length} records):`);

  if (violations.length === 0) {
    lines.push("- No violation records on file");
  } else {
    for (const v of violations) {
      lines.push(`- Type: ${v.violation_type || "unknown"} | Status: ${v.status || "unknown"} | Days Open: ${v.days_open ?? "unknown"} | Opened: ${v.opened_date || "unknown"} | Case: ${v.case_id || "none"}`);
      lines.push(`  Description: ${v.raw_description || "no description available"}`);
    }
  }

  lines.push("");
  lines.push("CONTACT DATA:");
  if (contacts.length > 0) {
    for (const c of contacts) {
      lines.push(`- Name: ${c.name || "unknown"} | Phone: ${c.phone || "unknown"} | Email: ${c.email || "unknown"} | Source: ${c.source || "unknown"}`);
    }
  } else {
    lines.push("- No contact data on file");
  }

  return lines.join("\n");
}

function parseAIBrief(
  aiText: string,
  snapScore: number | null,
  newestViolationDate: string | null
): {
  brief_text: string;
  generated_at: string;
  property_snap_score: number | null;
  newest_violation_date: string | null;
} {
  const sanitizedText = sanitizeInsightForStorage(aiText) ?? aiText.trim();

  return {
    brief_text: sanitizedText,
    generated_at: new Date().toISOString(),
    property_snap_score: snapScore,
    newest_violation_date: newestViolationDate,
  };
}
