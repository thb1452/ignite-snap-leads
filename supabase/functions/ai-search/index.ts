import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "apply_filters",
    description:
      "Convert a natural-language property search into structured filters. Only set fields the user explicitly mentions.",
    parameters: {
      type: "object",
      properties: {
        state: {
          type: "string",
          description:
            "Two-letter US state abbreviation, e.g. FL, TX, CA, OH. Convert full names to abbreviations.",
        },
        cities: {
          type: "array",
          items: { type: "string" },
          description: "City names exactly as the user mentions them.",
        },
        snapScoreMin: {
          type: "number",
          description: "Minimum snap score (0-100).",
        },
        snapScoreMax: {
          type: "number",
          description: "Maximum snap score (0-100).",
        },
        openViolationsOnly: {
          type: "boolean",
          description: "True if user wants only properties with open/active violations.",
        },
        multipleViolationsOnly: {
          type: "boolean",
          description: "True if user wants properties with multiple violations.",
        },
        repeatOffenderOnly: {
          type: "boolean",
          description: "True if user wants repeat offenders only.",
        },
        lastSeenDays: {
          type: "number",
          description:
            "Filter properties updated within this many days. E.g. 'last 30 days' → 30.",
        },
        violationType: {
          type: "string",
          description:
            "Violation category: structural, electrical, plumbing, fire_safety, exterior, zoning, sanitation, mechanical, environmental, general.",
        },
        sortBy: {
          type: "string",
          enum: ["snap_score", "newest_violation", "recently_updated"],
          description: "Sort order for results.",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
};

const SYSTEM_PROMPT = `You are a property search assistant for a code enforcement violation database.
Users describe what properties they want to find. Use the apply_filters tool to convert their request into structured filters.
Only set fields the user explicitly mentions. If a query is unrelated to property/violation searches, do NOT call the tool — just reply with a short helpful message.
State names should be converted to two-letter abbreviations (Florida→FL, Texas→TX, California→CA, etc.).
City names should be title-cased as written.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();
    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ filters: {}, message: "Please enter a search query." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("AZURE_OPENAI_API_KEY");
    const endpoint = Deno.env.get("AZURE_OPENAI_ENDPOINT");
    const deployment = Deno.env.get("AZURE_OPENAI_DEPLOYMENT");

    if (!apiKey || !endpoint || !deployment) {
      console.error("Missing Azure OpenAI configuration");
      return new Response(
        JSON.stringify({ error: "AI search is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2024-10-21`;

    const azureRes = await fetch(url, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: query.trim() },
        ],
        tools: [TOOL_SCHEMA],
        tool_choice: "auto",
        temperature: 0,
        max_completion_tokens: 300,
      }),
    });

    if (!azureRes.ok) {
      const errText = await azureRes.text();
      console.error("Azure OpenAI error:", azureRes.status, errText);
      return new Response(
        JSON.stringify({ error: "AI service temporarily unavailable" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await azureRes.json();
    const choice = data.choices?.[0];

    // No tool call → the query wasn't about property filters
    if (!choice?.message?.tool_calls?.length) {
      const fallbackMsg =
        choice?.message?.content ||
        "I can help you search properties! Try something like 'open violations in Florida with score above 70'.";
      return new Response(
        JSON.stringify({ filters: {}, message: fallbackMsg }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const toolCall = choice.message.tool_calls[0];
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(toolCall.function.arguments);
    } catch {
      return new Response(
        JSON.stringify({ filters: {}, message: "I couldn't understand that query. Try again?" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map tool output to LeadFilters shape
    const filters: Record<string, unknown> = {};
    if (args.state) filters.state = args.state;
    if (args.cities && Array.isArray(args.cities) && args.cities.length > 0)
      filters.cities = args.cities;
    if (args.snapScoreMin != null || args.snapScoreMax != null) {
      filters.snapScoreRange = [
        typeof args.snapScoreMin === "number" ? args.snapScoreMin : 0,
        typeof args.snapScoreMax === "number" ? args.snapScoreMax : 100,
      ];
    }
    if (args.openViolationsOnly) filters.openViolationsOnly = true;
    if (args.multipleViolationsOnly) filters.multipleViolationsOnly = true;
    if (args.repeatOffenderOnly) filters.repeatOffenderOnly = true;
    if (typeof args.lastSeenDays === "number") filters.lastSeenDays = args.lastSeenDays;
    if (args.violationType) filters.violationType = args.violationType;
    if (args.sortBy) filters.sortBy = args.sortBy;

    return new Response(JSON.stringify({ filters }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-search error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
