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
    console.log(`Exporting data for user: ${userId}`);

    // Collect all user data from various tables
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
      supabase.from("profiles").select("*").eq("user_id", userId),
      supabase.from("lead_lists").select("*").eq("user_id", userId),
      supabase.from("list_properties").select("*").eq("created_by", userId),
      supabase.from("lead_activity").select("*").eq("user_id", userId),
      supabase.from("email_preferences").select("*").eq("user_id", userId),
      supabase.from("email_templates").select("*").eq("user_id", userId),
      supabase.from("call_logs").select("*").eq("user_id", userId),
      supabase.from("credit_ledger").select("*").eq("user_id", userId),
      supabase.from("upload_jobs").select("*").eq("user_id", userId),
    ]);

    const exportData = {
      exported_at: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        email_confirmed_at: user.email_confirmed_at,
      },
      profile: profileResult.data || [],
      lead_lists: listsResult.data || [],
      list_properties: listPropertiesResult.data || [],
      lead_activity: leadActivityResult.data || [],
      email_preferences: emailPreferencesResult.data || [],
      email_templates: emailTemplatesResult.data || [],
      call_logs: callLogsResult.data || [],
      credit_ledger: creditLedgerResult.data || [],
      upload_jobs: uploadJobsResult.data || [],
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
  } catch (error) {
    console.error("Error exporting user data:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
