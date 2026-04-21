# BYOA Integration System — Migration Notes

Phase 1 sets up the database foundation for the "Bring Your Own Accounts" (BYOA) system,
where users connect their own Twilio, skip-trace, and CRM accounts.

## What was created

| Table | Purpose |
|---|---|
| `owners` | Skip-trace results (name, phones, emails) linked to a property |
| `user_integrations` | Connected third-party accounts. Credentials stored in Supabase Vault — only `vault_secret_id` is held here |
| `integration_action_log` | Audit log of every action (SMS, skip trace) with cost estimate |
| `suppression_list` | Opt-out phone/email blocklist |
| `user_activation_events` | Tracks "first SMS sent", "first skip trace" milestones |

## Tenancy model

All tables scope by `org_id` via the existing `profiles.org_id` column:

```sql
org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid())
```

## Encryption (Supabase Vault)

Credentials never live in `user_integrations`. The `integration-validate` Edge Function
calls `vault.create_secret(plaintext, name)` (service_role) and stores the returned uuid
as `vault_secret_id`. Action functions read plaintext via `public.get_integration_secret(integration_id)`,
a SECURITY DEFINER helper granted only to `service_role`.

## Cron

Daily 3am UTC job `revalidate-integrations` invokes the `integration-revalidate` Edge Function (Phase 2).

## Sanity checks

```sql
select count(*) from pg_extension where extname = 'supabase_vault';

select tablename, rowsecurity from pg_tables
where schemaname = 'public'
  and tablename in ('owners','user_integrations','integration_action_log',
                    'suppression_list','user_activation_events');

select jobname, schedule from cron.job where jobname = 'revalidate-integrations';
```

## Phase 2 / Phase 3

Phase 2 = Edge Functions (`integration-validate`, `integration-send-sms`, `integration-skip-trace`, `integration-revalidate`).
Phase 3 = Frontend handoff docs in `docs/byoa-*.md`.
