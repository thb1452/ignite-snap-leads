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

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function singleLine(value: unknown): string {
  return typeof value === "string" ? value.replace(/[\r\n\u0000-\u001f\u007f]/g, " ").slice(0, 200).trim() : "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const token = /^Bearer ([^\s]+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!token) return json({ error: "Please sign in before contacting support." }, 401);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey || !Deno.env.get("RESEND_API_KEY")) {
    return json({ error: "Support submission is temporarily unavailable. Your message was not submitted." }, 503);
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user || user.is_anonymous || !user.email_confirmed_at) {
      return json({ error: "Please sign in with a verified email before contacting support." }, 401);
    }

    const payload = await req.json().catch(() => null);
    const message = typeof payload?.message === "string" ? payload.message.trim() : "";
    if (!message || message.length > 5000) {
      return json({ error: "Enter a message between 1 and 5000 characters." }, 400);
    }
    if (payload?.type !== "support" && payload?.type !== "feature") {
      return json({ error: "Choose support or feature request." }, 400);
    }
    const requestType = payload.type === "feature" ? "Feature Request" : "Support Request";

    // Reply only to the Auth-verified address, never a caller-editable profile
    // field. Reject header separators rather than attempting to repair them.
    const email = user.email?.trim() ?? "";
    if (!/^[^\s@<>,;:"()\\]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
      return json({ error: "Your verified account email cannot be used for replies. Please update it in account settings." }, 422);
    }

    const [profileRes, subRes] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
      supabase.rpc("fn_get_user_subscription", { p_user_id: user.id }),
    ]);
    const fullName = singleLine(profileRes.data?.full_name) || singleLine(user.user_metadata?.full_name) || "Customer";
    const subscription = !subRes.error && Array.isArray(subRes.data) ? subRes.data[0] : null;
    const planName = singleLine(subscription?.display_name || subscription?.plan_name) || "Not confirmed";

    const resend = await getResend();
    let result;
    try {
      result = await resend.emails.send({
        from: "Snap Ignite <noreply@snapignite.com>",
        to: ["hello@snapignite.com"],
        // This handler intentionally retains pinned Resend SDK 2.0.0, whose
        // request field is reply_to (the newer SDK uses replyTo).
        reply_to: email,
        subject: `[${requestType}] from ${fullName}`,
        html: `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f1f5f9; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px;">
    <p>From: ${escapeHtml(fullName)} (${escapeHtml(email)})</p>
    <p>Plan: ${escapeHtml(planName)} &bull; Type: ${escapeHtml(requestType)}</p>
  </div>
  <div style="white-space: pre-wrap;">${escapeHtml(message)}</div>
  <hr><p>User ID: ${escapeHtml(user.id)}</p>
</body></html>`.trim(),
      });
    } catch {
      // A transport failure can occur after provider acceptance. Do not retry
      // automatically or claim rejection/delivery when the outcome is unknown.
      console.error("support_submission_outcome_unknown");
      return json({ error: "We could not confirm submission. Your draft has been kept; delivery status is unknown.", status: "unknown" }, 502);
    }
    if (result?.error) {
      // Provider error objects can contain addresses or message content.
      console.error("support_submission_provider_rejected");
      return json({ error: "The email service did not accept your request. Your draft has been kept.", status: "rejected" }, 502);
    }
    const messageId = result?.data?.id;
    if (typeof messageId !== "string" || !messageId.trim()) {
      console.error("support_submission_acceptance_unconfirmed");
      return json({ error: "We could not confirm submission. Your draft has been kept; delivery status is unknown.", status: "unknown" }, 502);
    }
    // Acceptance is not delivery; a provider webhook is needed to prove the
    // support inbox received it. Do not promise a response time.
    return json({ success: true, status: "accepted", message_id: messageId }, 202);
  } catch {
    console.error("support_submission_unavailable");
    return json({ error: "Support submission is temporarily unavailable. Your draft has been kept." }, 503);
  }
});
