import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const APP_URL = Deno.env.get("APP_URL") || "https://ignite-snap-leads.lovable.app";

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
    if (userError || !user?.email) throw new Error("Invalid token or no email");

    // Generate a password reset link using admin API
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: user.email,
      options: { redirectTo: `${APP_URL}/reset-password` },
    });

    if (linkError) throw linkError;

    // The generated link contains a token — build the proper redirect URL
    const actionLink = linkData?.properties?.action_link;
    if (!actionLink) throw new Error("Failed to generate reset link");

    // Send via Resend for reliable delivery
    const resend = await getResend();
    await resend.emails.send({
      from: "Snap Ignite <noreply@ignite-snap-leads.lovable.app>",
      to: [user.email],
      subject: "Reset Your Password – Snap Ignite",
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 24px;">
    <img src="${APP_URL}/logo.jpg" alt="Snap Ignite" style="height: 40px; width: auto;">
  </div>
  <h2 style="font-size: 20px; font-weight: 600; text-align: center; margin-bottom: 16px;">Reset Your Password</h2>
  <p style="font-size: 15px;">You requested a password reset for your Snap Ignite account.</p>
  <p style="font-size: 15px;">Click the button below to set a new password. This link expires in 1 hour.</p>
  <div style="text-align: center; margin: 32px 0;">
    <a href="${actionLink}"
       style="display: inline-block; padding: 14px 32px; background: #111; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
      Reset Password →
    </a>
  </div>
  <p style="font-size: 13px; color: #888;">If you didn't request this, you can safely ignore this email.</p>
  <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e5e5; font-size: 12px; color: #888; text-align: center;">
    © ${new Date().getFullYear()} Snap Ignite. All rights reserved.
  </div>
</body>
</html>`.trim(),
    });

    console.log(`Password reset email sent to ${user.email}`);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Password reset error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
