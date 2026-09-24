// Internal workers are service endpoints, not customer APIs. Do not authorize by
// decoding a caller-supplied JWT role, the apikey's mere presence, or a cron hint.
// This comparison makes no Auth/DB/provider calls, so a denial has no side effects.
type Environment = (name: string) => string | undefined;

function equalSecret(actual: string | null, expected: string | undefined): boolean {
  if (!actual || !expected || actual.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}

export function internalWorkerDenial(
  req: Request,
  cors: Record<string, string> = {},
  env: Environment = (name) => Deno.env.get(name),
): Response | null {
  const deny = (status: number, error: string) => new Response(JSON.stringify({ error }), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
  if (req.method !== "POST") return deny(405, "method_not_allowed");
  if (req.signal.aborted) return deny(503, "authorization_unavailable");

  const publicKey = env("SUPABASE_ANON_KEY");
  const configuredService = env("SUPABASE_SERVICE_ROLE_KEY");
  const configuredInternal = env("INTERNAL_FUNCTION_SECRET");
  const service = configuredService && configuredService.length >= 32 && publicKey && configuredService !== publicKey
    ? configuredService : undefined;
  // A dedicated scheduler secret must be long enough to avoid accidental weak
  // defaults. Generate it outside source control and store scheduler-side in Vault.
  const internal = configuredInternal && configuredInternal.length >= 32 && configuredInternal !== publicKey
    ? configuredInternal : undefined;
  if (!service && !internal) return deny(503, "authorization_unavailable");

  const bearer = /^Bearer ([^\s]+)$/.exec(req.headers.get("authorization") ?? "")?.[1] ?? null;
  const suppliedInternal = req.headers.get("x-internal-secret");
  if (equalSecret(bearer, service) || equalSecret(req.headers.get("apikey"), service) ||
      equalSecret(suppliedInternal, service) || equalSecret(suppliedInternal, internal)) return null;
  return deny(401, "unauthorized");
}
