# Synthetic hosted staging bootstrap

This directory prepares SQL offline for a newly created, dedicated **$0 hosted Supabase staging project**. It makes no network calls and reads no credentials. The operator must bind deployment to the new staging reference recorded privately during provisioning. Neither the customer project nor the existing Ops project is a valid target. Project creation, billing configuration, Edge deployment and frontend environment changes are separate operations owned by the release operator.

The user has approved this isolated $0 staging work. This bootstrap does not authorize Lovable prompting, remixing, credits, paid Supabase features or a production release.

## Generate and verify

From the repository root with its dependencies installed:

```sh
node scripts/tests/release-hosted/generate.mjs
node scripts/tests/release-hosted/verify-local.mjs
```

`manifest.json` records every input and generated output SHA-256 and the exact application order. Generation fails if the test fixture's managed Auth replacement prefix changes. It strips that prefix rather than creating fake hosted roles, `auth.users`, `auth.uid()` or `auth.jwt()`. The local verifier uses PGlite and an explicitly local Auth test double; its PASS is a SQL/permission result, not hosted GoTrue or deployment evidence.

## Apply in this exact order

Apply each file as one SQL transaction to the verified blank staging target using the approved Supabase migration capability. Preserve each candidate migration verbatim. Do not replay historical migration directories. The original generated baseline header mentions the three initial migrations; the manifest and sequence below also include the later additive conflict migration, without rewriting that already-deployed snapshot.

1. `scripts/tests/release-hosted/00_baseline.sql`
2. `supabase/migrations/20260924182954_snap_customer_workspace_isolation_v1.sql`
3. `supabase/migrations/20260924183006_snap_billing_atomic_fulfillment_v1.sql`
4. `supabase/migrations/20260924183021_snap_crm_workflow_v1.sql`
5. `scripts/tests/release-hosted/04_hardening.sql`
6. `scripts/tests/release-hosted/05_function_search_paths.sql`
7. `scripts/tests/release-hosted/06_self_scoped_role_check.sql`
8. `supabase/migrations/20260924214048_snap_crm_outcome_conflict_v1.sql`

Do not create accounts or run the HTTP harness between these steps. The initial transaction requires empty application schemas and zero Auth users, captures only managed object definitions, creates the selected schema, and revokes client access. Step 5 requires the three initial candidate RPCs and no Auth users, installs explicit grants, verifies the managed Auth/realtime fingerprints are unchanged, checks checkout is still disabled, and changes the marker to `ready`. The final three additive steps preserve this ready marker. If a step fails, stop; inspect the specific SQL error. The scripts intentionally do not silently resume or overwrite an existing schema. For the existing staging project with the original five-file sequence and patches 05/06 already applied, apply only the new conflict migration; it changes stale-outcome signaling to `PT409` without replaying the baseline or changing its grants. The manifest records this actual deployment order, the original bootstrap subset and the additive subset separately.

For an operator using an already configured direct SQL connection, the equivalent commands are below. `STAGING_DATABASE_URL` must be a private environment variable already bound to the approved target; never put its value in command text, logs, Git, or this document. These commands are instructions only; the generator never invokes them.

```sh
psql "$STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f scripts/tests/release-hosted/00_baseline.sql
psql "$STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/migrations/20260924182954_snap_customer_workspace_isolation_v1.sql
psql "$STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/migrations/20260924183006_snap_billing_atomic_fulfillment_v1.sql
psql "$STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/migrations/20260924183021_snap_crm_workflow_v1.sql
psql "$STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f scripts/tests/release-hosted/04_hardening.sql
psql "$STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f scripts/tests/release-hosted/05_function_search_paths.sql
psql "$STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f scripts/tests/release-hosted/06_self_scoped_role_check.sql
psql "$STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/migrations/20260924214048_snap_crm_outcome_conflict_v1.sql
```

## Contract and scope

| Area | Included | Limit |
|---|---|---|
| Managed platform | Existing Auth roles/functions/users/identities; an application signup trigger; unchanged realtime publications | No Auth configuration, redirects, SMTP, realtime publication changes or Storage objects |
| Customer identity | Real signup trigger creates a personal workspace, user role and seven private stages; candidate workspace readiness/ban fences | The HTTP harness must use real GoTrue accounts and sessions; SQL-created users do not prove hosted Auth |
| Manual CRM | Profiles, stages, leads, activities, contacts, ordinary five-field property snapshot; exact candidate handoff/outcome RPCs and relationship constraints | Property search/map/county dashboards and full property schema are absent; open the CRM route directly for its browser test |
| Source preservation | Restrictive property/lead/activity policies, source identity/delete protections, candidate preservation of private CRM history | Acceptance, mapping and links are limited synthetic fixtures. Source detail RPC deliberately returns `42501`. No successful municipal handoff/detail/export, provenance, refresh or historical source restore claim |
| Billing | Captured plan/subscription shape, ledger/transactions/receipts, exact atomic candidate, scoped current-subscription/usage/trial reads, scoped credit view | No plans, prices, provider IDs, subscriptions, payments or credentials seeded; checkout stays disabled. No export reservation or trial-start/usage mutation RPC installed |
| Integrations | Empty CRM-support tables available for scoped reads | No provider delivery, geocoding, enrichment, webhooks, cron jobs, Vault secrets or external calls |

The scoped read functions come from the current repository's reviewed entitlement migration. Only their definitions and the `subscription_usage` columns/constraints are selected; its production-specific catalog preflight and other operations are excluded. All declared source files and hashes are in the manifest.

The baseline seeds only the fixed synthetic default organization and its seven stage definitions needed by the existing fixture. It contains no real properties, source cases, customer rows, credentials or private account identifiers. All public base tables have RLS enabled. Anonymous application-table/RPC access is revoked. Authenticated users receive selected reads plus private manual CRM writes; unlocks, roles, billing records and integration credentials are not client-writable. Service-role fixture writes support the separate HTTP harness; the marker itself is service-readable only.

`public.snap_hosted_fixture` has `kind='snap_hosted_synthetic'`, `schema_version=1`, a generated `fixture_nonce`, and `state='ready'` only after hardening. The HTTP harness should select these fields with the service credential, require the exact privately recorded nonce and target, and publish only pass/fail and version. Its managed-definition fingerprints and nonce must not enter public test receipts.

## Evidence required after application

Record privately the target reference, fresh-project status/$0 quote, exact repository revision, all applied SQL hashes, migration result, and marker nonce. Confirm all public base tables have RLS, candidate billing RPCs reject customer execution, customer roles cannot change the marker, Auth/realtime fingerprints match, and checkout remains held. Then run the dedicated hosted HTTP harness for two real GoTrue identities, separate workspaces, RLS, CRM handoff/retry, token refresh and ban enforcement. Local verifier success does not substitute for these requests or the browser acceptance pass.

This script is not a restorable production backup. Production snapshot/restore evidence and its source/private CRM preservation gates remain separate release requirements. Do not deploy the selected fixture schema to production or use it to migrate existing customers.

## Additive maintenance after the baseline

`05_function_search_paths.sql` applies only to a `ready` synthetic fixture. It fixes `search_path=pg_catalog` on `public.tg_set_updated_at()` and `snap_relaunch.require_source_acceptance_v1(uuid,text)`. Both bodies use built-ins and fully qualified application references. The transaction compares each function's catalog definition, excluding `proconfig`, before and after; bodies, ownership and grants must be unchanged. It does not modify managed Auth, data, policies, source access or checkout holds. Do not replay the original baseline or candidate migrations when applying it.

The local verifier applies this additive patch after the manifest's bootstrap sequence and checks that exactly those two function configurations changed. It then applies `06_self_scoped_role_check.sql`, which restricts customer role checks to their own account while preserving trusted SQL definer dependencies, followed by the new CRM conflict migration. It verifies exact-command replay still succeeds and a stale competing request returns SQLSTATE `PT409` without writing a receipt. This is local verification; hosted application/advisor evidence is recorded separately by the release operator.
