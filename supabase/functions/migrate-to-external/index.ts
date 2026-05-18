import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// =====================================================
// HARD-CODED REFUSE LIST — never migrate these tables.
// Sage tables are owned by an external agent and must
// not be overwritten under any circumstances.
// =====================================================
const FORBIDDEN_TABLES = new Set<string>([
  "cash_buyers",
  "buyer_purchases",
  "upload_staging",      // transient
  "spatial_ref_sys",     // PostGIS
  "census_places",       // open data
]);

function refuseIfForbidden(table: string) {
  if (FORBIDDEN_TABLES.has(table) || table.startsWith("agent_")) {
    throw new Error(
      `REFUSE: '${table}' is on the FORBIDDEN_TABLES list (Sage / transient / externally-managed). This function will never touch it.`
    );
  }
}

// =====================================================
// Migration order — PARENTS BEFORE CHILDREN (FK-safe inserts).
// User's "verify priority" order differs (properties/violations first
// for early-abort); we keep insert order FK-safe and let the script
// drive verify cadence.
// =====================================================
const TABLES_TO_MIGRATE = [
  // Top-level parents
  "jurisdictions",          // 3,586
  "properties",             // 448,617
  // Direct children of properties / jurisdictions
  "violations",             // 611,531
  "targets",                // 15,015
  // FOIA stack (templates / sources / profiles before requests)
  "foia_templates",
  "foia_sources",
  "foia_profiles",
  "foia_requests",          // 8,632
  "foia_responses",
  "foia_assignments",
  "foia_invites",
  // Property children
  "list_properties",        // 119,307
  "property_contacts",
  "owners",
  "upload_jobs",
  "parcel_attributes",
  "enrichment_misses",
  "enrichment_jobs",
  "enrichment_sources",
  "geocoding_jobs",
  // Press / VA
  "press_accounts",
  "press_rotation",
  "va_credential_slots",
  // Pipeline
  "pipeline_stages",
  "pipeline_progress",
  // Subscriptions
  "subscription_plans",
  "subscription_usage",
  // Diagnostics last
  "error_logs",             // 8,271
];

const BATCH_SIZE = 1000;

// Tables keyed by something other than `id` — use offset-based pagination.
const TABLES_WITHOUT_ID: Record<string, string> = {
  // none currently; add here if a table has no `id` column
};

interface MigrationResult {
  table: string;
  status: "success" | "error" | "skipped";
  rowsMigrated?: number;
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { action, table, cursor } = await req.json();

    // Guard at the very top — refuse forbidden tables for ANY action that
    // names one. Read-only actions on the whole set (get-status/verify
    // with no table) are still allowed; we just skip the forbidden ones.
    if (table) refuseIfForbidden(table);

    const sourceUrl = Deno.env.get("SUPABASE_URL")!;
    const sourceServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const targetUrl = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
    const targetServiceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;

    if (!targetUrl || !targetServiceKey) {
      throw new Error("External Supabase credentials not configured (EXTERNAL_SUPABASE_URL / EXTERNAL_SUPABASE_SERVICE_ROLE_KEY)");
    }

    const sourceClient = createClient(sourceUrl, sourceServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: "public" },
    });
    const targetClient = createClient(targetUrl, targetServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: "public" },
    });

    // -------- list-tables --------
    if (action === "list-tables") {
      return json({ tables: TABLES_TO_MIGRATE, forbidden: [...FORBIDDEN_TABLES] });
    }

    // -------- get-status --------
    // Single table mode (fast) OR full sweep (slow, 25+ counts).
    if (action === "get-status") {
      if (table) {
        const row = await countPair(sourceClient, targetClient, table);
        return json({ table, ...row });
      }
      const tableCounts: Record<string, { source: number; target: number }> = {};
      for (const t of TABLES_TO_MIGRATE) {
        tableCounts[t] = await countPair(sourceClient, targetClient, t);
      }
      return json({
        tables: tableCounts,
        totalTables: TABLES_TO_MIGRATE.length,
        ready: Object.values(tableCounts).every((t) => t.target >= 0),
      });
    }

    // -------- migrate-table --------
    if (action === "migrate-table" && table) {
      const result = await migrateTable(sourceClient, targetClient, table, cursor);
      return json(result);
    }

    // -------- verify --------
    // Threshold rule: tolerate max(50 rows, 0.5%) drift per table.
    if (action === "verify") {
      if (table) {
        const pair = await countPair(sourceClient, targetClient, table);
        return json({ table, ...pair, ...driftEval(pair.source, pair.target) });
      }
      const verification: Record<string, any> = {};
      let allOk = true;
      for (const t of TABLES_TO_MIGRATE) {
        const pair = await countPair(sourceClient, targetClient, t);
        const drift = driftEval(pair.source, pair.target);
        verification[t] = { ...pair, ...drift };
        if (!drift.withinThreshold) allOk = false;
      }
      return json({
        tables: verification,
        allWithinThreshold: allOk,
        summary: allOk
          ? "All tables within drift threshold (max(50 rows, 0.5%))"
          : "One or more tables exceed drift threshold — inspect 'tables' map",
      });
    }

    return json(
      { error: "Invalid action. Use: list-tables | get-status | migrate-table | verify" },
      400
    );
  } catch (error) {
    console.error("[Migration] Error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function driftEval(source: number, target: number) {
  if (target < 0) {
    return { drift: null, withinThreshold: false, reason: "target table missing" };
  }
  const diff = Math.abs(source - target);
  const pctAllowed = Math.ceil(source * 0.005);
  const allowed = Math.max(50, pctAllowed);
  return {
    drift: source - target,
    allowed,
    withinThreshold: diff <= allowed,
  };
}

async function countPair(sourceClient: any, targetClient: any, table: string) {
  try {
    const { count: src } = await sourceClient.from(table).select("*", { count: "exact", head: true });
    const { count: tgt, error: tgtErr } = await targetClient.from(table).select("*", { count: "exact", head: true });
    return {
      source: src ?? 0,
      target: tgtErr ? -1 : (tgt ?? 0),
    };
  } catch {
    return { source: 0, target: -1 };
  }
}

async function migrateTable(
  sourceClient: any,
  targetClient: any,
  table: string,
  cursor?: string,
  retryCount = 0
): Promise<MigrationResult & { hasMore: boolean; nextCursor: string | null }> {
  const useOffset = table in TABLES_WITHOUT_ID;
  console.log(`[Migration] ${table} cursor=${cursor ?? "START"} mode=${useOffset ? "offset" : "id"} retry=${retryCount}`);

  try {
    let query = sourceClient.from(table).select("*").limit(BATCH_SIZE);

    if (useOffset) {
      const off = cursor ? parseInt(cursor, 10) : 0;
      query = query.range(off, off + BATCH_SIZE - 1);
    } else {
      query = query.order("id", { ascending: true });
      if (cursor) query = query.gt("id", cursor);
    }

    const { data: rows, error: fetchError } = await query;

    if (fetchError) {
      if (fetchError.message?.includes("timeout") && retryCount < 2) {
        await new Promise((r) => setTimeout(r, 500));
        return migrateTable(sourceClient, targetClient, table, cursor, retryCount + 1);
      }
      return { table, status: "error", error: fetchError.message, hasMore: true, nextCursor: cursor ?? null };
    }

    if (!rows || rows.length === 0) {
      return { table, status: "success", rowsMigrated: 0, hasMore: false, nextCursor: null };
    }

    // Pick conflict column per table. Most have `id`; tables in TABLES_WITHOUT_ID
    // need a custom composite key.
    const onConflict = useOffset ? TABLES_WITHOUT_ID[table] : "id";

    const { error: insertError } = await targetClient
      .from(table)
      .upsert(rows, { onConflict, ignoreDuplicates: false });

    if (insertError) {
      if (insertError.message?.includes("timeout") && retryCount < 2) {
        await new Promise((r) => setTimeout(r, 500));
        return migrateTable(sourceClient, targetClient, table, cursor, retryCount + 1);
      }
      return { table, status: "error", error: insertError.message, hasMore: true, nextCursor: cursor ?? null };
    }

    let nextCursor: string | null;
    if (useOffset) {
      const off = cursor ? parseInt(cursor, 10) : 0;
      nextCursor = String(off + rows.length);
    } else {
      nextCursor = rows[rows.length - 1]?.id ?? null;
    }

    return {
      table,
      status: "success",
      rowsMigrated: rows.length,
      hasMore: rows.length === BATCH_SIZE,
      nextCursor,
    };
  } catch (e) {
    return { table, status: "error", error: (e as Error).message, hasMore: false, nextCursor: cursor ?? null };
  }
}
