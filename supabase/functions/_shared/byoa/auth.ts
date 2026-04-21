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
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  const token = authHeader.replace("Bearer ", "");
  const { data: authData, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !authData?.user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  const userId = authData.user.id;

  const { data: profile } = await admin
    .from("profiles")
    .select("org_id")
    .eq("user_id", userId)
    .maybeSingle();
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
