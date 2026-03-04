import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// State FIPS → abbreviation map
const FIPS_TO_ABBR: Record<string, string> = {
  "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT",
  "10":"DE","11":"DC","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL",
  "18":"IN","19":"IA","20":"KS","21":"KY","22":"LA","23":"ME","24":"MD",
  "25":"MA","26":"MI","27":"MN","28":"MS","29":"MO","30":"MT","31":"NE",
  "32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND",
  "39":"OH","40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD",
  "47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA","54":"WV",
  "55":"WI","56":"WY","60":"AS","66":"GU","69":"MP","72":"PR","78":"VI",
};

const ABBR_TO_FIPS: Record<string, string> = {};
for (const [fips, abbr] of Object.entries(FIPS_TO_ABBR)) {
  ABBR_TO_FIPS[abbr] = fips;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Check caller is admin
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleRow } = await sb
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Admin required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || "report"; // "populate" | "report"

    // ── Step 1: Populate census_places if requested or table is empty ──
    if (action === "populate") {
      // Get distinct states from properties
      const { data: stateRows } = await sb
        .from("properties")
        .select("state")
        .not("state", "is", null);

      const states = [
        ...new Set(
          (stateRows || [])
            .map((r: any) => r.state?.toUpperCase()?.trim())
            .filter((s: string) => s && s.length === 2 && ABBR_TO_FIPS[s])
        ),
      ] as string[];

      let totalInserted = 0;
      const errors: string[] = [];

      for (const abbr of states) {
        const fips = ABBR_TO_FIPS[abbr];
        try {
          const url = `https://api.census.gov/data/2020/dec/pl?get=NAME&for=place:*&in=state:${fips}`;
          const res = await fetch(url);
          if (!res.ok) {
            errors.push(`Census API failed for ${abbr}: ${res.status}`);
            continue;
          }
          const rows: string[][] = await res.json();
          // First row is header: ["NAME","state","place"]
          const places = rows.slice(1).map((r) => ({
            name: r[0].replace(/ (city|town|village|CDP|borough|municipality),.*$/i, "").trim(),
            state_fips: r[1],
            state_abbr: abbr,
            place_fips: r[2],
          }));

          // Upsert in chunks of 500
          for (let i = 0; i < places.length; i += 500) {
            const chunk = places.slice(i, i + 500);
            const { error: upsertErr } = await sb
              .from("census_places")
              .upsert(chunk, { onConflict: "name,state_abbr", ignoreDuplicates: true });
            if (upsertErr) {
              errors.push(`Upsert error for ${abbr}: ${upsertErr.message}`);
            } else {
              totalInserted += chunk.length;
            }
          }
        } catch (e: any) {
          errors.push(`Fetch error for ${abbr}: ${e.message}`);
        }
      }

      return new Response(
        JSON.stringify({
          action: "populate",
          states_processed: states.length,
          places_upserted: totalInserted,
          errors,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Step 2: Generate comparison report ──
    // Get all distinct city/state pairs with counts
    const { data: cityRows, error: cityErr } = await sb.rpc("fn_dashboard_stats").then(() => null as any).catch(() => null);

    // Direct query for distinct cities
    const allCities: { city: string; state: string; count: number }[] = [];
    const pageSize = 1000;
    let offset = 0;
    let hasMore = true;

    // We need to aggregate - fetch raw and count client-side
    const cityMap = new Map<string, { city: string; state: string; count: number }>();

    while (hasMore) {
      const { data, error } = await sb
        .from("properties")
        .select("city, state")
        .not("city", "is", null)
        .not("state", "is", null)
        .range(offset, offset + pageSize - 1);

      if (error || !data || data.length === 0) {
        hasMore = false;
        break;
      }

      for (const r of data) {
        const key = `${r.city?.toUpperCase()?.trim()}|${r.state?.toUpperCase()?.trim()}`;
        const existing = cityMap.get(key);
        if (existing) {
          existing.count++;
        } else {
          cityMap.set(key, {
            city: r.city?.trim() || "",
            state: r.state?.toUpperCase()?.trim() || "",
            count: 1,
          });
        }
      }

      offset += pageSize;
      hasMore = data.length === pageSize;
    }

    // Get all census places
    const censusMap = new Map<string, string>();
    let cOffset = 0;
    let cMore = true;
    while (cMore) {
      const { data: cp } = await sb
        .from("census_places")
        .select("name, state_abbr")
        .range(cOffset, cOffset + pageSize - 1);
      if (!cp || cp.length === 0) {
        cMore = false;
        break;
      }
      for (const r of cp) {
        censusMap.set(`${r.name.toUpperCase()}|${r.state_abbr}`, r.name);
      }
      cOffset += pageSize;
      cMore = cp.length === pageSize;
    }

    if (censusMap.size === 0) {
      return new Response(
        JSON.stringify({
          error: "Census places table is empty. Run with action='populate' first.",
          total_cities: cityMap.size,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Compare
    const verified: { city: string; state: string; count: number; census_name: string }[] = [];
    const flagged: { city: string; state: string; count: number; suggested: string | null; similarity: number }[] = [];

    for (const [, entry] of cityMap) {
      const key = `${entry.city.toUpperCase()}|${entry.state}`;
      if (censusMap.has(key)) {
        verified.push({ ...entry, census_name: censusMap.get(key)! });
        continue;
      }

      // Try fuzzy match - find best match in same state
      let bestMatch = "";
      let bestSim = 0;

      // Simple trigram-like similarity (Dice coefficient on bigrams)
      const cityUpper = entry.city.toUpperCase();
      const cityBigrams = getBigrams(cityUpper);

      for (const [censusKey, censusName] of censusMap) {
        if (!censusKey.endsWith(`|${entry.state}`)) continue;
        const censusBigrams = getBigrams(censusName.toUpperCase());
        const sim = diceCoefficient(cityBigrams, censusBigrams);
        if (sim > bestSim) {
          bestSim = sim;
          bestMatch = censusName;
        }
      }

      flagged.push({
        ...entry,
        suggested: bestSim > 0.3 ? bestMatch : null,
        similarity: Math.round(bestSim * 100) / 100,
      });
    }

    // Sort flagged by count descending
    flagged.sort((a, b) => b.count - a.count);

    return new Response(
      JSON.stringify({
        action: "report",
        total_cities: cityMap.size,
        verified_count: verified.length,
        flagged_count: flagged.length,
        flagged_properties: flagged.reduce((sum, f) => sum + f.count, 0),
        census_places_loaded: censusMap.size,
        flagged: flagged.slice(0, 200), // Top 200 flagged
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function getBigrams(str: string): Set<string> {
  const bigrams = new Set<string>();
  for (let i = 0; i < str.length - 1; i++) {
    bigrams.add(str.substring(i, i + 2));
  }
  return bigrams;
}

function diceCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const bigram of a) {
    if (b.has(bigram)) intersection++;
  }
  return (2 * intersection) / (a.size + b.size);
}
