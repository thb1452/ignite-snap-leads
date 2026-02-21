import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function getResend() {
  const { Resend } = await import("https://esm.sh/resend@2.0.0");
  return new Resend(Deno.env.get("RESEND_API_KEY"));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from JWT
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) throw new Error("Invalid token");

    const { message, type } = await req.json();
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      throw new Error("Message is required");
    }
    if (message.length > 5000) {
      throw new Error("Message too long (max 5000 characters)");
    }

    const requestType = type === "feature" ? "Feature Request" : "Support Request";

    // Fetch profile + subscription info
    const [profileRes, subRes] = await Promise.all([
      supabase.from("profiles").select("full_name, email").eq("user_id", user.id).maybeSingle(),
      supabase.rpc("fn_get_user_subscription", { p_user_id: user.id }),
    ]);

    const fullName = profileRes.data?.full_name || user.user_metadata?.full_name || "Unknown";
    const email = profileRes.data?.email || user.email || "Unknown";

    let planName = "Free";
    if (Array.isArray(subRes.data) && subRes.data.length > 0) {
      planName = subRes.data[0].display_name || subRes.data[0].plan_name || "Free";
    }

    const resend = await getResend();
    await resend.emails.send({
      from: "Snap Ignite <noreply@snapignite.com>",
      to: ["support@snapignite.com"],
      replyTo: email,
      subject: `[${requestType}] from ${fullName}`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f1f5f9; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px;">
    <p style="margin: 0 0 4px; font-weight: 600; font-size: 16px;">From: ${fullName} (${email})</p>
    <p style="margin: 0; font-size: 14px; color: #64748b;">Plan: ${planName} &bull; Type: ${requestType}</p>
  </div>
  <div style="white-space: pre-wrap; font-size: 15px; color: #334155;">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0 16px;" />
  <p style="font-size: 12px; color: #94a3b8;">User ID: ${user.id}</p>
</body>
</html>`.trim(),
    });

    console.log(`Support message sent: ${requestType} from ${email}`);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Support message error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
