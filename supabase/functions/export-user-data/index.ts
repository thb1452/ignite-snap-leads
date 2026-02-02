import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Hard cap to prevent timeouts on large accounts
const MAX_ROWS_PER_TABLE = 1000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from JWT
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error("Invalid or expired token");
    }

    const userId = user.id;
    console.log(`Exporting data for user: ${userId}`);

    // Collect user data with filtered fields (no internal spine exposure)
    const [
      profileResult,
      listsResult,
      listPropertiesResult,
      leadActivityResult,
      emailPreferencesResult,
      emailTemplatesResult,
      callLogsResult,
      creditLedgerResult,
      uploadJobsResult,
    ] = await Promise.all([
      // Profile - filtered fields
      supabase
        .from("profiles")
        .select("email, full_name, created_at")
        .eq("user_id", userId)
        .limit(MAX_ROWS_PER_TABLE),
      
      // Lists - user-facing fields only
      supabase
        .from("lead_lists")
        .select("name, created_at")
        .eq("user_id", userId)
        .limit(MAX_ROWS_PER_TABLE),
      
      // List properties - minimal reference
      supabase
        .from("list_properties")
        .select("added_at, property_id")
        .eq("created_by", userId)
        .limit(MAX_ROWS_PER_TABLE),
      
      // Lead activity - user-facing fields
      supabase
        .from("lead_activity")
        .select("status, notes, created_at, updated_at")
        .eq("user_id", userId)
        .limit(MAX_ROWS_PER_TABLE),
      
      // Email preferences - user settings only
      supabase
        .from("email_preferences")
        .select("weekly_digest_enabled, digest_day, digest_hour, timezone, created_at")
        .eq("user_id", userId)
        .limit(MAX_ROWS_PER_TABLE),
      
      // Email templates - user content
      supabase
        .from("email_templates")
        .select("name, subject, content, is_default, created_at")
        .eq("user_id", userId)
        .limit(MAX_ROWS_PER_TABLE),
      
      // Call logs - user-facing data
      supabase
        .from("call_logs")
        .select("phone_number, call_type, status, duration, notes, created_at")
        .eq("user_id", userId)
        .limit(MAX_ROWS_PER_TABLE),
      
      // Credit ledger - transaction summary (no internal IDs)
      supabase
        .from("credit_ledger")
        .select("delta, reason, created_at")
        .eq("user_id", userId)
        .limit(MAX_ROWS_PER_TABLE),
      
      // Upload jobs - summary only (no storage paths or internal flags)
      supabase
        .from("upload_jobs")
        .select("filename, file_size, status, total_rows, processed_rows, properties_created, violations_created, created_at, finished_at")
        .eq("user_id", userId)
        .limit(MAX_ROWS_PER_TABLE),
    ]);

    const exportData = {
      exported_at: new Date().toISOString(),
      export_note: `Data capped at ${MAX_ROWS_PER_TABLE} records per category. Contact support for complete archives.`,
      user: {
        email: user.email,
        created_at: user.created_at,
        email_verified: !!user.email_confirmed_at,
      },
      profile: profileResult.data || [],
      lead_lists: listsResult.data || [],
      list_properties: listPropertiesResult.data || [],
      lead_activity: leadActivityResult.data || [],
      email_preferences: emailPreferencesResult.data || [],
      email_templates: emailTemplatesResult.data || [],
      call_logs: callLogsResult.data || [],
      credit_transactions: creditLedgerResult.data || [],
      upload_history: uploadJobsResult.data || [],
    };

    console.log(`Data export complete for user: ${userId}`);

    return new Response(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="user-data-export-${new Date().toISOString().split('T')[0]}.json"`,
      },
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Error exporting user data:", errMsg);
    return new Response(
      JSON.stringify({ error: errMsg }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
