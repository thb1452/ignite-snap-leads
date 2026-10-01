// Resolve auth user + their org_id + (optionally) load their active integration row.
// Centralizes the boilerplate every BYOA edge function repeats.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, idempotency-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export interface AuthContext {
  admin: SupabaseClient;
  userId: string;
  orgId: string;
}

export async function getAuthContext(req: Request): Promise<
  | { ok: true; ctx: AuthContext }
  | { ok: false; status: number; error: string }
> {
  if (req.method !== "POST") return { ok: false, status: 405, error: "method_not_allowed" };
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey || !anonKey || serviceKey === anonKey) {
    return { ok: false, status: 503, error: "authorization_unavailable" };
  }

  const token = /^Bearer ([^\s]+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!token || token === anonKey || token === serviceKey) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: authData, error: authErr } = await userClient.auth.getUser(token);
  const user = authData?.user;
  // GoTrue versions may return these administrative account-state fields even
  // when their public User type omits them. Treat malformed ban values as denied.
  const accountState = user as unknown as Record<string, unknown> | undefined;
  const bannedUntil = accountState?.banned_until;
  if (authErr || !user || user.is_anonymous || accountState?.deleted_at ||
      (!user.email_confirmed_at && !user.phone_confirmed_at) ||
      (bannedUntil != null && (typeof bannedUntil !== "string" || !Number.isFinite(Date.parse(bannedUntil)) || Date.parse(bannedUntil) > Date.now()))) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  const userId = user.id;

  // Run this with the caller's JWT: a service-role client would bypass the very
  // isolation being checked. Missing migration or failed lookup must deny before
  // touching an integration, Vault credential, or external provider.
  const { data: workspaceReady, error: workspaceError } = await userClient.rpc("fn_customer_workspace_ready_v1");
  if (workspaceError) return { ok: false, status: 503, error: "workspace_verification_unavailable" };
  if (workspaceReady !== true) return { ok: false, status: 403, error: "private_workspace_required" };

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profile, error: profileError } = await userClient
    .from("profiles")
    .select("org_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError) return { ok: false, status: 503, error: "workspace_verification_unavailable" };
  if (!profile?.org_id) {
    return { ok: false, status: 400, error: "No org_id on profile" };
  }

  return { ok: true, ctx: { admin, userId, orgId: profile.org_id } };
}

export async function loadActiveIntegration(
  admin: SupabaseClient,
  orgId: string,
  serviceName: string
): Promise<
  | { ok: true; row: { id: string; vault_secret_id: string; status: string; display_metadata: Record<string, unknown> | null } }
  | { ok: false; status: number; error: string }
> {
  const { data, error } = await admin
    .from("user_integrations" as any)
    .select("id, vault_secret_id, status, display_metadata")
    .eq("org_id", orgId)
    .eq("service_name", serviceName)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };
  if (!data) return { ok: false, status: 404, error: `No ${serviceName} integration configured` };
  if ((data as any).status !== "active") {
    return { ok: false, status: 409, error: `Integration is ${(data as any).status}, not active` };
  }
  return { ok: true, row: data as any };
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
