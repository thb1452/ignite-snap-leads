import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Batched fetch size (RPC uses POST JSON — safe for large uuid[]; keep moderate for query time / memory)
const PROPERTY_FETCH_BATCH = 750;
const UNLOCK_CHECK_BATCH = 400;

const MAX_EXPORT_ROWS = 50000;
const QUERY_RETRIES = 3;
const RETRY_BASE_MS = 250;

// BACKWARD-COMPATIBLE EXPORT - Original column order preserved
const EXPORT_COLUMNS = [
  "address",
  "city",
  "state",
  "zip",
  "violation_type",
  "opened_date",
  "status",
  "snap_summary",
  "snap_score",
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRpcJsonArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function withRetries<T>(
  label: string,
  fn: () => Promise<{ data: T; error: { message?: string } | null }>,
): Promise<T> {
  let lastMessage = "unknown error";
  for (let attempt = 0; attempt < QUERY_RETRIES; attempt++) {
    const { data, error } = await fn();
    if (!error) return data as T;
    lastMessage = error.message || lastMessage;
    console.warn(`[export-csv] ${label} attempt ${attempt + 1}/${QUERY_RETRIES} failed:`, lastMessage);
    if (attempt < QUERY_RETRIES - 1) {
      await sleep(RETRY_BASE_MS * (attempt + 1));
    }
  }
  throw new Error(`${label} failed after ${QUERY_RETRIES} attempts: ${lastMessage}`);
}

function propertyRowToCsvLine(property: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  snap_insight?: string | null;
  snap_score?: number | null;
  violations?: Array<{ violation_type?: string | null; status?: string | null; opened_date?: string | null }>;
}): string {
  const violations = property.violations || [];
  const violationCount = violations.length;
  const openViolationCount = violations.filter((v) =>
    ["Open", "Pending", "Active", "In Progress", "New"].some((s) =>
      (v.status || "").toLowerCase().includes(s.toLowerCase()),
    ),
  ).length;
  const uniqueTypes = [...new Set(violations.map((v) => v.violation_type).filter(Boolean))].join("; ");
  const dates = violations.map((v) => v.opened_date).filter(Boolean).sort();
  const earliestDate = dates[0] || "";
  const statusSummary = `${openViolationCount} open / ${violationCount} total`;
  const row = [
    escapeCSV(property.address || ""),
    escapeCSV(property.city || ""),
    escapeCSV(property.state || ""),
    escapeCSV(property.zip || ""),
    escapeCSV(uniqueTypes),
    escapeCSV(earliestDate),
    escapeCSV(statusSummary),
    escapeCSV(property.snap_insight || ""),
    property.snap_score?.toString() || "",
  ];
  return row.join(",");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let city: string | null = null;
    let minScore: string | null = null;
    let maxScore: string | null = null;
    let jurisdictionId: string | null = null;
    let propertyIds: string[] | null = null;

    if (req.method === "POST") {
      const body = await req.json();
      city = body.city || null;
      minScore = body.minScore?.toString() || null;
      maxScore = body.maxScore?.toString() || null;
      jurisdictionId = body.jurisdictionId || null;
      propertyIds = Array.isArray(body.propertyIds) ? body.propertyIds : null;
      console.log(`[export-csv] POST request with ${propertyIds?.length || 0} propertyIds`);
    } else {
      const url = new URL(req.url);
      city = url.searchParams.get("city");
      minScore = url.searchParams.get("minScore");
      maxScore = url.searchParams.get("maxScore");
      jurisdictionId = url.searchParams.get("jurisdictionId");
      const propertyIdsParam = url.searchParams.get("propertyIds");
      propertyIds = propertyIdsParam ? propertyIdsParam.split(",").filter((id) => id.trim()) : null;
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Missing required environment variables");
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      console.error("[export-csv] Auth failed:", claimsErr?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = { id: claimsData.claims.sub as string, email: claimsData.claims.email as string };

    const { data: subData } = await supabase
      .from("user_subscriptions")
      .select(
        "status, trial_exports_used, trial_exports_limit, trial_ends_at, plan:subscription_plans(data_tier, max_monthly_exports)",
      )
      .eq("user_id", user.id)
      .in("status", ["active", "trialing", "past_due", "trial"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let isPaygUser = false;
    // Track which properties still need unlocking (for credit deduction during export)
    let propertyIdsNeedingUnlock: string[] = [];

    if (!subData) {
      if (propertyIds && propertyIds.length > 0) {
        // Check which properties are already unlocked
        const alreadyUnlockedIds = new Set<string>();
        for (let i = 0; i < propertyIds.length; i += UNLOCK_CHECK_BATCH) {
          const slice = propertyIds.slice(i, i + UNLOCK_CHECK_BATCH);
          const { data: unlockedRows, error: unlockedErr } = await supabase.rpc("fn_check_unlocked_batch", {
            p_user_id: user.id,
            p_property_ids: slice,
          });

          if (unlockedErr) {
            console.error("[export-csv] Unlock entitlement check failed:", unlockedErr.message);
            break;
          }
          for (const r of (unlockedRows as { property_id: string }[] | null) || []) {
            alreadyUnlockedIds.add(r.property_id);
          }
        }

        // Find properties that still need unlocking
        propertyIdsNeedingUnlock = propertyIds.filter((id) => !alreadyUnlockedIds.has(id));

        if (propertyIdsNeedingUnlock.length === 0) {
          // All already unlocked — no credits needed
          isPaygUser = true;
          console.log("[export-csv] No subscription, all properties already unlocked — allowing export");
        } else {
          // Some need unlocking — check if user has enough credits/free unlocks
          const { data: profileRow } = await supabase
            .from("profiles")
            .select("free_unlocks_remaining")
            .eq("user_id", user.id)
            .maybeSingle();

          const freeRemaining = (profileRow as { free_unlocks_remaining?: number })?.free_unlocks_remaining ?? 0;

          const { data: creditsRow } = await supabase
            .from("v_user_credits")
            .select("balance")
            .eq("user_id", user.id)
            .maybeSingle();

          const creditBalance = (creditsRow as { balance?: number })?.balance ?? 0;
          const totalAvailable = freeRemaining + creditBalance;

          if (totalAvailable < propertyIdsNeedingUnlock.length) {
            return new Response(
              JSON.stringify({
                error: `Not enough credits. Need ${propertyIdsNeedingUnlock.length}, have ${totalAvailable}.`,
                code: "NO_SUBSCRIPTION",
              }),
              { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }

          isPaygUser = true;
          console.log(
            `[export-csv] PAYG user — ${propertyIdsNeedingUnlock.length} properties need unlock, free=${freeRemaining}, credits=${creditBalance}`,
          );
        }
      } else {
        // No propertyIds provided and no subscription
        return new Response(JSON.stringify({ error: "No active subscription", code: "NO_SUBSCRIPTION" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const isTrialUser = !isPaygUser && !!subData && (subData.status === "trial" || subData.status === "trialing");

    if (isTrialUser && subData?.trial_ends_at && new Date(subData.trial_ends_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Trial has expired. Please upgrade to continue exporting.", code: "TRIAL_EXPIRED" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const dataTier = (subData?.plan as { data_tier?: string })?.data_tier || "basic";
    const maxExports = (subData?.plan as { max_monthly_exports?: number })?.max_monthly_exports || 0;
    const enforceCodeViolationOnly = dataTier === "basic";

    console.log(
      "[export-csv] User data tier:",
      dataTier,
      "max exports:",
      maxExports,
      "status:",
      subData?.status ?? "payg",
    );

    const buildFilterQuery = () => {
      let q = supabase.from("properties").select(`
          address,
          city,
          state,
          zip,
          snap_insight,
          snap_score,
          enforcement_type,
          violations (
            violation_type,
            status,
            opened_date
          )
        `);

      if (city) q = q.eq("city", city);
      if (jurisdictionId) q = q.eq("jurisdiction_id", jurisdictionId);
      if (minScore) q = q.gte("snap_score", parseInt(minScore));
      if (maxScore) q = q.lte("snap_score", parseInt(maxScore));

      if (dataTier === "basic") {
        q = q.eq("enforcement_type", "code_violation");
      }

      q = q.order("snap_score", { ascending: false, nullsFirst: false });
      return q;
    };

    if (dataTier === "basic") {
      console.log("[export-csv] Filtering to code_violation only (basic tier)");
    }

    const csvDataLines: string[] = [];
    let rowsFetched = 0;

    if (propertyIds && propertyIds.length > 0) {
      const seen = new Set<string>();
      const uniqueIds: string[] = [];
      for (const id of propertyIds) {
        if (!seen.has(id)) {
          seen.add(id);
          uniqueIds.push(id);
        }
      }

      const cappedIds = uniqueIds.slice(0, MAX_EXPORT_ROWS);
      if (uniqueIds.length > MAX_EXPORT_ROWS) {
        console.warn(`[export-csv] Capping export from ${uniqueIds.length} to ${MAX_EXPORT_ROWS} property IDs`);
      }

      const requestedCount = cappedIds.length;

      if (isTrialUser && subData) {
        const trialUsed = subData.trial_exports_used || 0;
        const trialLimit = subData.trial_exports_limit || 500;
        const trialRemaining = trialLimit - trialUsed;
        if (requestedCount > trialRemaining) {
          console.log(
            "[export-csv] Trial user hit export limit (pre-fetch):",
            user.id,
            "tried:",
            requestedCount,
            "remaining:",
            trialRemaining,
          );
          return new Response(
            JSON.stringify({
              error: "Trial export limit reached",
              code: "TRIAL_EXPORT_LIMIT_EXCEEDED",
              message: `Cannot export ${requestedCount} properties. You have ${trialRemaining} trial exports remaining. Upgrade to continue.`,
              requested: requestedCount,
              remaining: trialRemaining,
            }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      console.log(
        `[export-csv] Fetching ${cappedIds.length} properties in RPC batches of ${PROPERTY_FETCH_BATCH}`,
      );

      for (let i = 0; i < cappedIds.length; i += PROPERTY_FETCH_BATCH) {
        const batchIds = cappedIds.slice(i, i + PROPERTY_FETCH_BATCH);

        const batchJson = await withRetries(`export batch ${Math.floor(i / PROPERTY_FETCH_BATCH) + 1}`, () =>
          supabase.rpc("fn_export_properties_batch", {
            p_property_ids: batchIds,
            p_enforce_code_violation_only: enforceCodeViolationOnly,
          }));

        const rows = parseRpcJsonArray(batchJson);
        if (rows.length === 0 && batchIds.length > 0) {
          console.warn("[export-csv] Batch returned 0 rows (missing or filtered properties)");
        }

        for (const property of rows) {
          csvDataLines.push(propertyRowToCsvLine(property as never));
        }
        rowsFetched += rows.length;

        console.log(
          `[export-csv] Batch ${Math.floor(i / PROPERTY_FETCH_BATCH) + 1}: rows=${rows.length}, csvLines=${csvDataLines.length}`,
        );
      }
    } else {
      const FILTER_PAGE = 1000;
      let offset = 0;

      while (rowsFetched < MAX_EXPORT_ROWS) {
        const data = await withRetries(`filter page offset=${offset}`, () =>
          buildFilterQuery().range(offset, offset + FILTER_PAGE - 1));

        if (!data || data.length === 0) break;

        for (const property of data) {
          csvDataLines.push(propertyRowToCsvLine(property as never));
        }
        rowsFetched += data.length;
        console.log(`[export-csv] Filter page: offset=${offset}, got=${data.length}, total=${rowsFetched}`);

        if (data.length < FILTER_PAGE) break;
        offset += FILTER_PAGE;
      }
    }

    const exportCount = csvDataLines.length;
    console.log(`[export-csv] Built CSV for ${exportCount} properties for user ${user.id}`);

    if (isPaygUser) {
      // Deduct credits for any properties not yet unlocked
      if (propertyIdsNeedingUnlock.length > 0) {
        console.log(
          `[export-csv] PAYG user — unlocking ${propertyIdsNeedingUnlock.length} properties via fn_unlock_property`,
        );
        let unlockErrors = 0;
        for (const propId of propertyIdsNeedingUnlock) {
          const { data: unlockResult, error: unlockErr } = await supabase.rpc("fn_unlock_property", {
            p_user_id: user.id,
            p_property_id: propId,
          });
          if (unlockErr) {
            console.error(`[export-csv] fn_unlock_property error for ${propId}:`, unlockErr.message);
            unlockErrors++;
            continue;
          }
          const result = unlockResult as { success?: boolean; error?: string };
          if (result && !result.success) {
            console.warn(`[export-csv] fn_unlock_property denied for ${propId}:`, result.error);
            unlockErrors++;
          }
        }
        console.log(
          `[export-csv] PAYG unlock complete: ${propertyIdsNeedingUnlock.length - unlockErrors} succeeded, ${unlockErrors} failed`,
        );
      } else {
        console.log("[export-csv] PAYG user — all properties already unlocked, no credits deducted");
      }
    } else if (isTrialUser) {
      const trialUsed = subData?.trial_exports_used || 0;
      const trialLimit = subData?.trial_exports_limit || 500;
      const trialRemaining = trialLimit - trialUsed;

      if (exportCount > trialRemaining) {
        console.log(
          "[export-csv] Trial user hit export limit (post-fetch):",
          user.id,
          "exported:",
          exportCount,
          "remaining:",
          trialRemaining,
        );
        return new Response(
          JSON.stringify({
            error: "Trial export limit reached",
            code: "TRIAL_EXPORT_LIMIT_EXCEEDED",
            message: `Cannot export ${exportCount} properties. You have ${trialRemaining} trial exports remaining. Upgrade to continue.`,
            requested: exportCount,
            remaining: trialRemaining,
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data: trialResult, error: trialError } = await supabase.rpc("fn_increment_trial_exports", {
        p_user_id: user.id,
        p_count: exportCount,
      });

      if (trialError) {
        console.error("[export-csv] Trial export tracking failed:", trialError.message);
        return new Response(JSON.stringify({ error: "Export temporarily unavailable", code: "USAGE_TRACKING_ERROR" }), {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (trialResult && !trialResult.success) {
        console.log("[export-csv] Trial export denied by DB:", trialResult.error);
        return new Response(
          JSON.stringify({
            error: "Trial export limit reached",
            code: "TRIAL_EXPORT_LIMIT_EXCEEDED",
            message: trialResult.error || "Trial export limit exceeded",
            remaining: trialResult.remaining || 0,
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      console.log(
        "[export-csv] Trial exports consumed:",
        exportCount,
        "for user:",
        user.id,
        "remaining:",
        trialResult?.remaining,
      );
    } else {
      const { data: usageResult, error: usageError } = await supabase.rpc("fn_consume_usage", {
        p_usage_type: "exports",
        p_amount: exportCount,
      });

      if (usageError) {
        console.error("[export-csv] Usage tracking failed:", usageError.message);
        return new Response(
          JSON.stringify({
            error: "Export temporarily unavailable",
            code: "USAGE_TRACKING_ERROR",
            message: "Unable to process export at this time. Please try again.",
          }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (usageResult && usageResult.allowed === false) {
        console.log("[export-csv] User hit export limit:", user.id, "tried to export:", exportCount);
        return new Response(
          JSON.stringify({
            error: "Credit limit reached",
            code: "EXPORT_LIMIT_EXCEEDED",
            message:
              usageResult.message ||
              `Cannot export ${exportCount} properties. You have reached your monthly credit limit. Please upgrade your plan to continue.`,
            requested: exportCount,
            remaining: usageResult.remaining || 0,
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      console.log(
        "[export-csv] Usage consumed:",
        exportCount,
        "for user:",
        user.id,
        "remaining:",
        usageResult?.remaining,
      );
    }

    const csvContent = [EXPORT_COLUMNS.join(","), ...csvDataLines].join("\n");

    return new Response(csvContent, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="snapignite_export_${Date.now()}.csv"`,
        "X-Export-Property-Count": String(exportCount),
      },
    });
  } catch (error) {
    console.error("[export-csv] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const isKnown = message.includes("failed after") || message.includes("Invalid export");
    return new Response(
      JSON.stringify({
        error: isKnown ? message : "Export failed. Try a smaller selection or retry shortly.",
        code: "EXPORT_FAILED",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

function escapeCSV(value: string): string {
  if (!value) return "";

  let safe = value;
  if (/^[=+\-@|\t]/.test(safe)) {
    safe = "\t" + safe;
  }

  if (safe.includes(",") || safe.includes("\n") || safe.includes('"')) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}
