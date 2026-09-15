import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

// This authorizes maintenance wrappers only. It grants no customer entitlement,
// source acceptance, quota, or permission to restore held AI processing.
const AUTH_TIMEOUT_MS = 10_000;

function equalSecret(actual: string | null, expected: string): boolean {
  if (!actual || actual.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}

function usableOperatorAccount(user: unknown): boolean {
  if (!user || typeof user !== "object") return false;
  const account = user as Record<string, unknown>;
  if (typeof account.id !== "string" || !account.id || account.is_anonymous === true || account.deleted_at != null) return false;
  const confirmed = [account.email_confirmed_at, account.phone_confirmed_at].some(value =>
    typeof value === "string" && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now());
  if (!confirmed) return false;
  if (account.banned_until != null) {
    if (typeof account.banned_until !== "string") return false;
    const until = Date.parse(account.banned_until);
    if (!Number.isFinite(until) || until > Date.now()) return false;
  }
  return true;
}

// No environment flag or request option can release this hold.
export function insightsGenerationHeld(): boolean { return true; }

export function insightsHeldResponse(cors: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: "insights_held", message: "Insight generation is paused pending source and account verification." }), {
    status: 503, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function insightOperatorDenial(req: Request, cors: Record<string, string>): Promise<Response | null> {
  const deny = (status: number, error: string) => new Response(JSON.stringify({ error }), {
    status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
  if (req.method !== "POST") return deny(405, "method_not_allowed");
  if (req.signal.aborted) return deny(503, "authorization_unavailable");
  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !service || !anon || service === anon) return deny(503, "authorization_unavailable");

  const token = /^Bearer ([^\s]+)$/.exec(req.headers.get("authorization") ?? "")?.[1] ?? null;
  // Only the actual configured private credential identifies an internal caller.
  // Neither an absent header, public anon key, claimed cron origin nor offset does.
  if (equalSecret(req.headers.get("x-internal-secret"), service) || equalSecret(token, service)) return null;
  if (!token || token === anon) return deny(401, "unauthorized");

  const controller = new AbortController();
  let rejectDeadline: (reason?: unknown) => void = () => {};
  const deadline = new Promise<never>((_, reject) => { rejectDeadline = reject; });
  const stop = () => { controller.abort(); rejectDeadline(new Error("authorization interrupted")); };
  const timer = setTimeout(stop, AUTH_TIMEOUT_MS);
  req.signal.addEventListener("abort", stop, { once: true });
  const boundedFetch: typeof fetch = (input, init) => fetch(input, { ...init, signal: controller.signal });
  try {
    const userClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` }, fetch: boundedFetch },
    });
    const userResult = await Promise.race([userClient.auth.getUser(token), deadline]);
    const user = userResult.data?.user;
    if (controller.signal.aborted) return deny(503, "authorization_unavailable");
    if (userResult.error || !user?.id || !usableOperatorAccount(user)) return deny(401, "unauthorized");

    const roleClient = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: boundedFetch },
    });
    // Re-read the current Auth record as well as current roles. A client JWT's
    // remembered role or an old account snapshot cannot authorize maintenance.
    const current = await Promise.race([roleClient.auth.admin.getUserById(user.id), deadline]);
    if (controller.signal.aborted || current.error) return deny(503, "authorization_unavailable");
    if (current.data?.user?.id !== user.id || !usableOperatorAccount(current.data.user)) return deny(401, "unauthorized");
    const roleResult = await Promise.race([
      roleClient.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle(),
      deadline,
    ]);
    if (controller.signal.aborted || roleResult.error) return deny(503, "authorization_unavailable");
    if (roleResult.data?.role !== "admin") return deny(403, "admin_required");
    return null;
  } catch {
    return deny(503, "authorization_unavailable");
  } finally {
    clearTimeout(timer);
    req.signal.removeEventListener("abort", stop);
  }
}
