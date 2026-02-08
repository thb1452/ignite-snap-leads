import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Tables to migrate in dependency order (referenced tables first)
const TABLES_TO_MIGRATE = [
  "jurisdictions",
  "organizations",
  "counties",
  "properties",
  "violations",
  "foia_templates",
  "foia_requests",
  "clean_leads",
  "email_templates",
  "email_preferences",
  "email_analytics",
  "lead_lists",
  "list_properties",
  "lead_activity",
  "upload_jobs",
  "upload_staging",
  "user_profiles",
  "user_roles",
  "user_subscriptions",
  "user_allowed_states",
  "user_invitations",
  "call_logs",
  "property_contacts",
  "credit_ledger",
  "credit_ledger_skiptrace",
  "skiptrace_jobs",
  "skiptrace_outcomes",
  "skiptrace_bulk_runs",
  "skiptrace_consent_log",
  "geocoding_jobs",
  "staging_uploads",
  "subscription_tiers",
];

// Larger batch now that constraints are dropped on target
const BATCH_SIZE_LARGE = 500;
const BATCH_SIZE_NORMAL = 500;

const LARGE_TABLES = ["properties", "violations", "upload_staging", "list_properties"];

function getBatchSize(table: string): number {
  return BATCH_SIZE_LARGE; // Use 500 for all tables - constraints are dropped
}

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
    const { action, table, offset = 0 } = await req.json();

    // Source: Lovable Cloud (current project)
    const sourceUrl = Deno.env.get("SUPABASE_URL")!;
    const sourceServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Target: External Supabase Pro
    const targetUrl = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
    const targetServiceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;

    if (!targetUrl || !targetServiceKey) {
      throw new Error("External Supabase credentials not configured");
    }

    const sourceClient = createClient(sourceUrl, sourceServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    
    const targetClient = createClient(targetUrl, targetServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Action: get-status - Check migration readiness
    if (action === "get-status") {
      const status = await getMigrationStatus(sourceClient, targetClient);
      return new Response(JSON.stringify(status), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: migrate-table - Migrate a single table's data
    if (action === "migrate-table" && table) {
      const result = await migrateTableData(sourceClient, targetClient, table, offset);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: get-schema - Export current schema for manual review
    if (action === "get-schema") {
      const schema = await getSchemaExport(sourceClient);
      return new Response(JSON.stringify({ schema }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: verify - Verify data integrity after migration
    if (action === "verify") {
      const verification = await verifyMigration(sourceClient, targetClient);
      return new Response(JSON.stringify(verification), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use: get-status, migrate-table, get-schema, verify" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[Migration] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function getMigrationStatus(sourceClient: any, targetClient: any) {
  const tableCounts: Record<string, { source: number; target: number }> = {};
  
  for (const table of TABLES_TO_MIGRATE) {
    try {
      const { count: sourceCount } = await sourceClient
        .from(table)
        .select("*", { count: "exact", head: true });
      
      const { count: targetCount, error: targetError } = await targetClient
        .from(table)
        .select("*", { count: "exact", head: true });
      
      tableCounts[table] = {
        source: sourceCount ?? 0,
        target: targetError ? -1 : (targetCount ?? 0), // -1 means table doesn't exist
      };
    } catch (e) {
      tableCounts[table] = { source: 0, target: -1 };
    }
  }

  return {
    tables: tableCounts,
    totalTables: TABLES_TO_MIGRATE.length,
    ready: Object.values(tableCounts).every(t => t.target >= 0),
  };
}

// Tables that don't have created_at column - use id for ordering
const TABLES_WITHOUT_CREATED_AT = [
  "email_analytics",
  "list_properties", 
  "skiptrace_outcomes",
  "skiptrace_bulk_items",
];

async function migrateTableData(
  sourceClient: any, 
  targetClient: any, 
  table: string,
  offset: number,
  retryCount = 0
): Promise<MigrationResult & { hasMore: boolean; nextOffset: number }> {
  const batchSize = getBatchSize(table);
  console.log(`[Migration] Starting ${table} at offset ${offset}, batch ${batchSize}, retry ${retryCount}`);

  try {
    // Fetch batch from source - use id for tables without created_at
    const orderColumn = TABLES_WITHOUT_CREATED_AT.includes(table) ? "id" : "created_at";
    
    const { data: rows, error: fetchError } = await sourceClient
      .from(table)
      .select("*")
      .range(offset, offset + batchSize - 1)
      .order(orderColumn, { ascending: true, nullsFirst: true });

    if (fetchError) {
      console.error(`[Migration] Fetch error for ${table}:`, fetchError);
      // Retry on timeout up to 3 times
      if (fetchError.message?.includes("timeout") && retryCount < 3) {
        console.log(`[Migration] Retrying ${table} at offset ${offset} (attempt ${retryCount + 1})`);
        await new Promise(r => setTimeout(r, 1000 * (retryCount + 1))); // Backoff
        return migrateTableData(sourceClient, targetClient, table, offset, retryCount + 1);
      }
      return { 
        table, 
        status: "error", 
        error: fetchError.message,
        hasMore: true, // Allow retry from dashboard
        nextOffset: offset
      };
    }

    if (!rows || rows.length === 0) {
      console.log(`[Migration] No more rows for ${table}`);
      return { 
        table, 
        status: "success", 
        rowsMigrated: 0,
        hasMore: false,
        nextOffset: offset
      };
    }

    // Upsert to target (handles duplicates gracefully)
    const { error: insertError } = await targetClient
      .from(table)
      .upsert(rows, { 
        onConflict: "id",
        ignoreDuplicates: false 
      });

    if (insertError) {
      console.error(`[Migration] Insert error for ${table}:`, insertError);
      // Retry on timeout
      if (insertError.message?.includes("timeout") && retryCount < 3) {
        console.log(`[Migration] Retrying insert for ${table} (attempt ${retryCount + 1})`);
        await new Promise(r => setTimeout(r, 1000 * (retryCount + 1)));
        return migrateTableData(sourceClient, targetClient, table, offset, retryCount + 1);
      }
      return { 
        table, 
        status: "error", 
        error: insertError.message,
        hasMore: true, // Allow retry
        nextOffset: offset
      };
    }

    const hasMore = rows.length === batchSize;
    console.log(`[Migration] Migrated ${rows.length} rows for ${table}, hasMore: ${hasMore}`);

    return {
      table,
      status: "success",
      rowsMigrated: rows.length,
      hasMore,
      nextOffset: offset + rows.length,
    };

  } catch (e) {
    console.error(`[Migration] Exception for ${table}:`, e);
    return {
      table,
      status: "error",
      error: e.message,
      hasMore: false,
      nextOffset: offset,
    };
  }
}

async function getSchemaExport(sourceClient: any) {
  // Get list of tables with their columns
  const { data: tables } = await sourceClient.rpc("get_table_info").catch(() => ({ data: null }));
  
  return {
    tables: TABLES_TO_MIGRATE,
    note: "Run the schema export SQL in your Supabase Pro SQL editor to create matching tables before migrating data.",
    migrationOrder: TABLES_TO_MIGRATE,
  };
}

async function verifyMigration(sourceClient: any, targetClient: any) {
  const verification: Record<string, { match: boolean; source: number; target: number }> = {};
  
  for (const table of TABLES_TO_MIGRATE) {
    try {
      const { count: sourceCount } = await sourceClient
        .from(table)
        .select("*", { count: "exact", head: true });
      
      const { count: targetCount } = await targetClient
        .from(table)
        .select("*", { count: "exact", head: true });
      
      verification[table] = {
        match: sourceCount === targetCount,
        source: sourceCount ?? 0,
        target: targetCount ?? 0,
      };
    } catch (e) {
      verification[table] = { match: false, source: 0, target: 0 };
    }
  }

  const allMatch = Object.values(verification).every(v => v.match);
  
  return {
    tables: verification,
    allMatch,
    summary: allMatch 
      ? "✅ All tables verified - migration complete!" 
      : "⚠️ Some tables have mismatched counts",
  };
}
