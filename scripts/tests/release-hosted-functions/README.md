# Exact candidate Edge Function bundle

Prepared from immutable commit `68850520cc3570bfcc9c0b8e23c8d1ab5e0c430d`, compared with `16c1397507026d1eb03bebec7c7aec08d45ec2ee`. This is a deployment input and limits report, not a deployment receipt. No hosted calls, secret reads, deployments or remote configuration changes were performed by the generator.

`manifest.json` contains exactly **24 changed entrypoints**, their **15 transitive shared source modules**, source hashes, dependency files, external import specifiers and environment **names only**. `functions-config.toml` makes every selected gateway setting explicit: **12 true, 12 false**. It deliberately contains no project binding. The other legacy functions in the repository configuration are excluded.

Run `node scripts/tests/release-hosted-functions/generate.mjs` to reproduce the public metadata from Git objects. The optional `--export-directory NEW_ABSOLUTE_DIRECTORY` exports unchanged source and dependency files to a new directory; it refuses overwrite. No environment files or repository project configuration are copied. Raw sources retain their existing account-specific constants, so do not attach the export to public release evidence. Source paths in the manifest are relative to this repository/export root; supply each function's own entrypoint and full transitive file closure to the deployment tool with their relative paths intact. Preserve relevant Deno dependency configuration files; do not flatten imports.

## Gateway and handler authentication

| Scope | Functions | `verify_jwt` | Handler requirement |
| --- | --- | --- | --- |
| Private workers (11) | `backfill-property-aggregates`, `distress-event-fanout`, `drip-runner`, `integration-revalidate`, `migrate-to-external`, `process-email-queue`, `signal-delta-worker`, `snap-mcp-keepwarm`, `test-pipeline`, `watchlist-fanout-worker`, `weekly-digest` | `false` | `internalWorkerDenial` requires POST and an exact configured private credential before work. A decoded role, public API key or customer JWT is insufficient. |
| Signed webhook (1) | `stripe-webhook` | `false` | Stripe signature and explicit environment/event/retrieved-object mode agreement. |
| Billing customer routes (5) | `create-checkout-session`, `create-portal-session`, `delete-user-account`, `verify-bulk-credits`, `verify-subscription` | `true` | Gateway verification, handler Auth user verification and route-specific ownership/billing guards. |
| Customer/provider/export/support (7) | `drip-enroll`, `enrich-property-contact`, `export-user-data`, `integration-send-sms`, `integration-skip-trace`, `send-sms-threaded`, `send-support-message` | `true` | Retain gateway verification, handler authorization and code-level provider holds. Some held handlers stop before their otherwise applicable Auth lookup. |

The original configuration omits `enrich-property-contact`, `send-support-message`, `verify-bulk-credits` and `verify-subscription`; their documented default is true. The fragment explicitly preserves that default. No blanket `--no-verify-jwt` is appropriate. Private workers accept the exact configured service credential on supported headers or the dedicated `x-internal-secret`; the latter must be at least 32 characters and distinct from the public key. Keep schedules inactive even after their guarded endpoints are deployed. Retired `migrate-to-external` and `test-pipeline` return 410 after private authentication.

Current official documentation retains gateway verification for user JWTs and disables it for independently authenticated services/webhooks. Do not assume that the new hosted signing algorithm or error-body/header contract matches the pinned local CLI. Prove that a real new-project user token reaches the handler, while missing and forged tokens are rejected by the hosted gateway; retain handler authorization as well.

## Configuration and secret names

This table separates names present in source from configuration needed for the bounded staging checks. A source read is not permission to populate that credential.

| Names | Staging disposition |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Platform-provided values must belong only to the new project. Verify presence and binding without printing them. Privileged values stay server-side. |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Frontend build values, not Edge secrets. Both must explicitly target staging before private flows; the existing client otherwise falls back to production. |
| `INTERNAL_FUNCTION_SECRET` | Independent long staging-only secret if private credential checks need it. Not needed to run workers; no schedules or positive worker work are authorized by this manifest. |
| `STRIPE_EXPECTED_LIVEMODE` | Explicit `false`. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Approved isolated sandbox only, supplied through a secure interface. Without them billing remains unavailable. Valid-signature hosted proof requires the secret for that exact endpoint, not a prior CLI forwarding secret. |
| `STRIPE_MANAGEMENT_PORTAL_CONFIGURATION_ID` | Only an active configuration in the approved sandbox with subscription changes disabled; otherwise portal management remains unavailable. |
| `APP_URL` | Exact isolated frontend origin, preventing localhost or production return-link fallbacks. |
| `LOVABLE_API_KEY`, `LOVABLE_SEND_URL` | Leave absent. `process-email-queue` has internal authentication but no code-level delivery hold and can call the Lovable email provider when configured. No Lovable sends or credit use are authorized here. |
| `RESEND_API_KEY` | Leave absent. `send-support-message` can send to an existing support recipient if configured; its expected safe result is 503. `weekly-digest` separately has a code hold. |
| `SNAP_PROXY_SECRET` | Leave absent. `snap-mcp-keepwarm` embeds a production proxy destination; valid private authentication plus this secret would cause a cross-environment request. Denial/missing-secret checks only, with no scheduler. A future success test needs a reviewed destination fix. |
| `BATCHDATA_API_KEY` | Leave absent; contact enrichment remains code-held. |
| `PIPELINE_API_KEY`, `EXTERNAL_SUPABASE_URL`, `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY` | Leave absent; referenced only by retired paths in this selected bundle. |

BYOA credentials are also read indirectly from Vault-backed integration records. Those are not Edge environment names; do not import integration rows or private Vault credentials. `integration-revalidate` can contact providers after private authorization if active integrations exist. Use synthetic records without usable provider credentials and keep all related schedules disabled. Signal/fanout/aggregate workers can mutate staging data after valid internal authorization, so authorization-denial tests do not authorize their success paths.

## Full-journey limits

| Surface | Dependency or limitation outside the 24-function delivery |
| --- | --- |
| Property unlock and single-property Checkout return | `handle-unlock` is called by Leads, UnlockModal and BulkUnlockBar, but is outside this manifest. It needs its own reviewed source/quota/fulfillment dependencies. Do not add it silently or treat a 404 as a successful denial. |
| CSV lead export | `export-csv` is outside this manifest; `src/services/export.ts` calls it. Its quota and source authorization schema are not supplied by a reduced tenancy fixture. |
| Password recovery | `send-password-reset` is outside this manifest; `useProfileSettings` calls it. Redirect and email behavior need separate isolated configuration and recipient authorization. |
| CRM manual workflow | Uses authenticated REST/RPCs rather than a new CRM Edge endpoint. Requires workspace readiness, complete CRM schema/grants, source authorization and actual two-account checks. A synthetic manual fixture is not municipal-source acceptance. |
| Complete private account export | The selected `export-user-data` requires legacy `profiles`, `lead_lists`, `list_properties`, `lead_activity`, `email_preferences`, `email_templates`, `call_logs`, `credit_ledger`, `upload_jobs` and their selected columns, plus CRM tables/policies. Missing categories must produce its fail-closed error, not be stubbed into a claimed complete export. |
| Browser paid Checkout | The exact source hard-codes subscription and bulk-pack price constants from an existing Stripe account. Seeding different sandbox plan rows alone does not replace those Checkout constants. Preserve the closed release row; a browser success journey needs separately reviewed sandbox-price configuration and scope. |
| Existing admin/provider surfaces | Additional calls include `enrich-list`, `bulk-enrich-properties`, `reprocess-upload-job`, `delete-upload-job`, `bulk-delete-properties`, `send-user-invitation`, `refresh-outdated-insights`, `backfill-zips`, `audit-cities`, `rotate-va-batch`, `send-foia-invite`, `generate-insights`, `geocode-properties`, `bulk-generate-missing-insights` and `bulk-rescore`. None is approved or covered by this changed-function manifest. |
| Build reproducibility | Exact repository source and available lock/config files are captured. Some pre-existing external import specifiers use major-only or unversioned dependencies. No dependency versions were silently changed. Record actual hosted bundle/version receipts; source hashes alone do not prove identical transitive remote resolution. |

The three candidate migrations and their verified compatible baseline must precede dependent handler testing. Preserve explicit table/function grants on the new project, RLS and source/provider/checkout holds. Avoid replaying all historical migrations or copying production rows/credentials. No customer release, hosted payment acceptance, useful delivery or pilot acceptance follows merely from deployment of these 24 functions.

## Verification recorded here

The generator asserts the exact changed-entrypoint set, one entry per function, gateway settings, worker guard dependency, every relative import's tracked existence and containment, and statically named environment reads. It parses actual TypeScript syntax, including dynamic imports, rather than matching comments. Every exported source file is read from the pinned Git commit. Local generation and metadata checks pass. These are static integrity checks; hosted compilation and runtime acceptance remain for the deploying owner.

Official references checked on 2026-09-24: [function configuration](https://supabase.com/docs/guides/functions/function-configuration), [function authentication](https://supabase.com/docs/guides/functions/auth), [JWT signing keys](https://supabase.com/docs/guides/auth/signing-keys), and [new table API grants](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).
