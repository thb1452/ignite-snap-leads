import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const APP_URL = Deno.env.get("APP_URL") || "https://snapignite.com";

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
      from: "Snap Ignite <noreply@snapignite.com>",
      to: [user.email],
      subject: "Reset your Snap Ignite password",
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 560px; margin: 0 auto; padding: 40px 20px; background-color: #f9f9f8;">
  <div style="background: #ffffff; border-radius: 12px; padding: 40px 32px; border: 1px solid #e8e8e6;">
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="font-size: 22px; font-weight: 700; color: #111; margin: 0;">Snap Ignite</h1>
    </div>
    <h2 style="font-size: 18px; font-weight: 600; color: #111; margin: 0 0 12px;">Reset your password</h2>
    <p style="font-size: 15px; color: #444; margin: 0 0 8px;">We received a request to reset the password for your Snap Ignite account.</p>
    <p style="font-size: 15px; color: #444; margin: 0 0 28px;">Click the button below to set a new password. This link expires in 1 hour.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${actionLink}"
         style="display: inline-block; padding: 14px 36px; background: #111; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
        Reset Password
      </a>
    </div>
    <p style="font-size: 13px; color: #999; margin: 24px 0 0;">If you didn't request this, no action is needed — your password will remain unchanged.</p>
  </div>
  <div style="margin-top: 24px; font-size: 12px; color: #aaa; text-align: center;">
    &copy; ${new Date().getFullYear()} Snap Ignite. All rights reserved.
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
