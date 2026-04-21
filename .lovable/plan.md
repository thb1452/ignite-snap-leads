

# Plan: Fix Build Errors + Phase 1 of BYOA Integration System

This response addresses two things in order:
1. **Fix the current build errors** that are blocking deploys (must happen first)
2. **Phase 1 of the BYOA build** per your approved decisions (profiles.org_id, Supabase Vault, owners table)

---

## Part 1 — Fix Build Errors (blocking)

Three edge function files have TypeScript errors caused by the stricter Supabase types — none are related to BYOA, but they block any new function deploy.

**1. `supabase/functions/enrich-list/index.ts` (line 485)**
The `enrichedRows` array is typed to require `aiBrief` and `actionLabel`, but the empty-batch push is missing them. Add `aiBrief: ""` and `actionLabel: ""` to the push at line 485.

**2. `supabase/functions/pipeline-runner/index.ts`**
- Loosen the `SupabaseClient` parameter type on `loadProgress` and `saveProgress` to `any` (the strict generic narrowing introduced by the SDK update doesn't accept the public-schema client).
- Add `declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };` at the top to satisfy the type checker (runtime is provided by Deno Deploy).

**3. `supabase/functions/process-email-queue/index.ts`**
- Type the `supabase` parameter in `moveToDlq` as `any` (same generic narrowing issue).
- Type `messages` from `read_email_batch` as `any[]` so `msg`, `id` callbacks aren't implicit-any.
- Cast `.insert({...})` payloads on `email_send_log` to `any` and the `.rpc('move_to_dlq', {...})` args to `any` to bypass the never-typed insert overloads (the table exists; types just haven't regenerated).

These are all minimal, surgical type-only fixes — no behavior changes.

---

## Part 2 — BYOA Phase 1: Database + Encryption

Your approvals locked in:
- **Tenancy:** existing `profiles.org_id` (no `memberships` table)
- **Encryption:** Supabase Vault (`vault.create_secret` / `vault.decrypted_secrets`)
- **Owners table:** create new

### Files to create

**`supabase/migrations/[timestamp]_byoa_owners.sql`**
- New `owners` table: `id`, `property_id` (fk → properties), `org_id` (fk → organizations), `name`, `phones jsonb`, `emails jsonb`, `mailing_address`, `confidence`, `source` (provider name), `raw_payload jsonb`, `created_by`, `created_at`, `updated_at`.
- Index on `(property_id)` and `(org_id, created_at desc)`.
- RLS enabled. Policy: `org_id IN (SELECT org_id FROM profiles WHERE user_id = auth.uid())`.

**`supabase/migrations/[timestamp]_byoa_integrations.sql`**
- `user_integrations` — same DDL as your spec but:
  - `org_id` references `organizations(id)` (existing)
  - `vault_secret_id uuid` replaces `encrypted_credentials jsonb` (Vault returns a UUID handle)
  - Keep `display_metadata`, `status`, `last_validated_at`, `validation_failure_count`, `daily_spend_cap_usd`, `daily_spend_used_usd`, `daily_spend_reset_at`
  - `unique(org_id, service_name)`
- `integration_action_log` — exactly per spec.
- `suppression_list` — exactly per spec, scoped via `org_id`.
- `user_activation_events` — `(user_id, event_type, occurred_at)` for the First Action Prompt state machine.
- RLS on all four tables. Policy template:
  ```sql
  org_id IN (SELECT org_id FROM profiles WHERE user_id = auth.uid())
  ```
- Helper SQL function `get_integration_secret(integration_id uuid) returns text` — `SECURITY DEFINER`, restricted to `service_role`, reads from `vault.decrypted_secrets`.

**`supabase/migrations/[timestamp]_byoa_cron.sql`**
- pg_cron job `revalidate-integrations` at `0 3 * * *` invoking the `integration-revalidate` edge function via `net.http_post` with the service-role key from Vault.

**`supabase/migrations/README-byoa.md`**
- Lists the three migrations, run order, what each does, post-migration sanity checks (e.g. `select count(*) from pg_extension where extname = 'supabase_vault';`), and rollback notes.

### Vault usage pattern (so you know what the edge functions will do later)

Write path (in `integration-validate`):
```sql
select vault.create_secret(:plaintext_credential_json, :name)
returns the vault_secret_id we store on user_integrations
```

Read path (in `integration-send-sms`, etc.):
```sql
select decrypted_secret from vault.decrypted_secrets where id = :vault_secret_id
```
Only callable with service_role — the helper function wraps this.

### What I will NOT do in Phase 1

- No edge functions yet
- No frontend changes
- No data writes — purely DDL
- Migrations are applied via Lovable Cloud's migration tool, but you'll see the SQL diff and can approve before it runs

---

## Order of operations in this response

1. Patch the three failing edge function files (type-only fixes).
2. Create the three Phase 1 migrations + README.
3. Stop. Wait for your approval before Phase 2 (edge functions).

