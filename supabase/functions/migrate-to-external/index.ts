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

// Smaller batch to avoid statement timeouts on source
const BATCH_SIZE = 100;

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
    const { action, table, offset = 0, cursor } = await req.json();

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

    // Action: migrate-table - Migrate using CURSOR-based pagination (fast!)
    if (action === "migrate-table" && table) {
      const result = await migrateTableDataCursor(sourceClient, targetClient, table, cursor);
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

// Tables that don't have an 'id' column - need special handling
const TABLES_WITHOUT_ID = [
  "skiptrace_outcomes",      // uses job_id + property_id composite
  "skiptrace_bulk_items",    // uses run_id + property_id composite
];

// CURSOR-BASED pagination - much faster than offset for large tables!
async function migrateTableDataCursor(
  sourceClient: any, 
  targetClient: any, 
  table: string,
  cursor?: string,
  retryCount = 0
): Promise<MigrationResult & { hasMore: boolean; nextCursor: string | null; migratedTotal?: number }> {
  console.log(`[Migration] Starting ${table} with cursor: ${cursor || 'START'}, retry ${retryCount}`);

  // For tables without 'id' column, use offset-based pagination as fallback
  if (TABLES_WITHOUT_ID.includes(table)) {
    return migrateTableOffset(sourceClient, targetClient, table, cursor ? parseInt(cursor) : 0, retryCount);
  }

  try {
    // Build query with cursor-based pagination using 'id' column
    let query = sourceClient
      .from(table)
      .select("*")
      .order("id", { ascending: true })
      .limit(BATCH_SIZE);
    
    // If we have a cursor, fetch rows AFTER that id
    if (cursor) {
      query = query.gt("id", cursor);
    }

    const { data: rows, error: fetchError } = await query;

    if (fetchError) {
      console.error(`[Migration] Fetch error for ${table}:`, fetchError);
      if (fetchError.message?.includes("timeout") && retryCount < 2) {
        console.log(`[Migration] Retrying ${table} with cursor ${cursor} (attempt ${retryCount + 1})`);
        await new Promise(r => setTimeout(r, 500));
        return migrateTableDataCursor(sourceClient, targetClient, table, cursor, retryCount + 1);
      }
      return { 
        table, 
        status: "error", 
        error: fetchError.message,
        hasMore: true,
        nextCursor: cursor || null
      };
    }

    if (!rows || rows.length === 0) {
      console.log(`[Migration] No more rows for ${table}`);
      return { 
        table, 
        status: "success", 
        rowsMigrated: 0,
        hasMore: false,
        nextCursor: null
      };
    }

    // Upsert to target
    const { error: insertError } = await targetClient
      .from(table)
      .upsert(rows, { 
        onConflict: "id",
        ignoreDuplicates: false 
      });

    if (insertError) {
      console.error(`[Migration] Insert error for ${table}:`, insertError);
      if (insertError.message?.includes("timeout") && retryCount < 2) {
        console.log(`[Migration] Retrying insert for ${table} (attempt ${retryCount + 1})`);
        await new Promise(r => setTimeout(r, 500));
        return migrateTableDataCursor(sourceClient, targetClient, table, cursor, retryCount + 1);
      }
      return { 
        table, 
        status: "error", 
        error: insertError.message,
        hasMore: true,
        nextCursor: cursor || null
      };
    }

    // Get the last row's id as the next cursor
    const lastRow = rows[rows.length - 1];
    const nextCursor = lastRow?.id || null;
    const hasMore = rows.length === BATCH_SIZE;
    
    console.log(`[Migration] Migrated ${rows.length} rows for ${table}, nextCursor: ${nextCursor}, hasMore: ${hasMore}`);

    return {
      table,
      status: "success",
      rowsMigrated: rows.length,
      hasMore,
      nextCursor,
    };

  } catch (e) {
    console.error(`[Migration] Exception for ${table}:`, e);
    return {
      table,
      status: "error",
      error: e.message,
      hasMore: false,
      nextCursor: cursor || null,
    };
  }
}

// Offset-based fallback for tables without 'id' column
async function migrateTableOffset(
  sourceClient: any,
  targetClient: any,
  table: string,
  offset: number,
  retryCount = 0
): Promise<MigrationResult & { hasMore: boolean; nextCursor: string | null }> {
  console.log(`[Migration] Using OFFSET for ${table} at offset ${offset}`);

  try {
    const { data: rows, error: fetchError } = await sourceClient
      .from(table)
      .select("*")
      .range(offset, offset + BATCH_SIZE - 1);

    if (fetchError) {
      console.error(`[Migration] Fetch error for ${table}:`, fetchError);
      if (fetchError.message?.includes("timeout") && retryCount < 2) {
        await new Promise(r => setTimeout(r, 500));
        return migrateTableOffset(sourceClient, targetClient, table, offset, retryCount + 1);
      }
      return { table, status: "error", error: fetchError.message, hasMore: true, nextCursor: String(offset) };
    }

    if (!rows || rows.length === 0) {
      return { table, status: "success", rowsMigrated: 0, hasMore: false, nextCursor: null };
    }

    // Determine conflict column(s) for this table
    let onConflict = "job_id,property_id"; // default for skiptrace tables
    if (table === "skiptrace_bulk_items") {
      onConflict = "run_id,property_id";
    }

    const { error: insertError } = await targetClient
      .from(table)
      .upsert(rows, { onConflict, ignoreDuplicates: false });

    if (insertError) {
      console.error(`[Migration] Insert error for ${table}:`, insertError);
      if (insertError.message?.includes("timeout") && retryCount < 2) {
        await new Promise(r => setTimeout(r, 500));
        return migrateTableOffset(sourceClient, targetClient, table, offset, retryCount + 1);
      }
      return { table, status: "error", error: insertError.message, hasMore: true, nextCursor: String(offset) };
    }

    const nextOffset = offset + rows.length;
    const hasMore = rows.length === BATCH_SIZE;

    console.log(`[Migration] Migrated ${rows.length} rows for ${table}, next offset: ${nextOffset}`);

    return {
      table,
      status: "success",
      rowsMigrated: rows.length,
      hasMore,
      nextCursor: String(nextOffset),
    };
  } catch (e) {
    console.error(`[Migration] Exception for ${table}:`, e);
    return { table, status: "error", error: e.message, hasMore: false, nextCursor: String(offset) };
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
