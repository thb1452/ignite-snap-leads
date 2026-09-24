import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { cancelOwnedSubscriptions } from "../_shared/billingClosure.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const headers = { ...corsHeaders, "Content-Type": "application/json" };
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers });
  let userId: string | undefined;
  let supabase: ReturnType<typeof createClient> | undefined;
  try {
    const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!url || !key || !stripeKey) throw new Error("SERVER_MISCONFIGURED");
    supabase = createClient(url, key);
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
    const { data: { user }, error } = await supabase.auth.getUser(authorization.slice(7));
    if (error || !user) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
    if ((await req.json()).confirmation !== "DELETE") return Response.json({ error: "Explicit deletion confirmation required" }, { status: 400, headers });
    userId = user.id;
    const { data: rows, error: mappingError } = await supabase.from("user_subscriptions")
      .select("stripe_subscription_id,stripe_customer_id,status").eq("user_id", userId);
    if (mappingError) throw mappingError;
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16", httpClient: Stripe.createFetchHttpClient() });
    const { error: startError } = await supabase.rpc("fn_record_account_closure_v1", { p_user_id: userId, p_status: "cancellation_requested" });
    if (startError) throw startError;
    await cancelOwnedSubscriptions(stripe, userId, user.email, rows ?? []);
    const { error: recordError } = await supabase.rpc("fn_record_account_closure_v1", { p_user_id: userId, p_status: "pending_retention_review" });
    if (recordError) throw recordError;
    // Financial records, private CRM and source retention require a reviewed erasure policy.
    // Never report deletion or delete auth/local rows before this work is complete.
    return Response.json({ success: false, closure_requested: true, billing_cancelled: true,
      message: "Subscription cancellation is confirmed. Account deletion is pending support review; your data has not been deleted. You can still export your account data." }, { status: 202, headers });
  } catch (error) {
    console.error("[account-closure] incomplete", error instanceof Error ? error.message : String(error));
    if (userId && supabase) await supabase.rpc("fn_record_account_closure_v1", { p_user_id: userId, p_status: "cancellation_failed" });
    return Response.json({ success: false, error: "Account closure could not be completed. Your data has been retained. Contact support to verify billing cancellation before retrying." }, { status: 503, headers });
  }
});
