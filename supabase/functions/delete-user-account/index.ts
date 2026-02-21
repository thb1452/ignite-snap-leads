import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    console.log(`Starting account deletion for user: ${userId}`);

    // Delete user data from all tables (in order to respect foreign keys)
    const deletionResults = [];

    // Delete from tables that reference user_id
    const tablesToDelete = [
      { table: "list_properties", column: "created_by" },
      { table: "lead_activity", column: "user_id" },
      { table: "email_preferences", column: "user_id" },
      { table: "email_templates", column: "user_id" },
      { table: "email_analytics", column: "user_id" },
      { table: "call_logs", column: "user_id" },
      { table: "credit_ledger", column: "user_id" },
      { table: "credit_ledger_skiptrace", column: "user_id" },
      { table: "property_contacts", column: "created_by" },
      { table: "skiptrace_jobs", column: "user_id" },
      { table: "skiptrace_bulk_runs", column: "user_id" },
      { table: "skiptrace_consent_log", column: "user_id" },
      { table: "upload_jobs", column: "user_id" },
      { table: "user_allowed_states", column: "user_id" },
      { table: "user_profiles", column: "user_id" },
      { table: "user_roles", column: "user_id" },
      { table: "user_subscriptions", column: "user_id" },
      { table: "geocoding_jobs", column: "user_id" },
      { table: "lead_lists", column: "user_id" },
      { table: "profiles", column: "user_id" },
    ];

    for (const { table, column } of tablesToDelete) {
      try {
        const { error } = await supabase
          .from(table)
          .delete()
          .eq(column, userId);
        
        if (error) {
          console.warn(`Warning deleting from ${table}:`, error.message);
        } else {
          console.log(`Deleted user data from ${table}`);
        }
        deletionResults.push({ table, success: !error, error: error?.message });
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.warn(`Error deleting from ${table}:`, errMsg);
        deletionResults.push({ table, success: false, error: errMsg });
      }
    }

    // Finally, delete the auth user
    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(userId);
    
    if (deleteUserError) {
      console.error("Error deleting auth user:", deleteUserError);
      throw new Error(`Failed to delete user account: ${deleteUserError.message}`);
    }

    console.log(`Account deletion complete for user: ${userId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Account deleted successfully",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Error deleting user account:", errMsg);
    return new Response(
      JSON.stringify({ error: errMsg }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
