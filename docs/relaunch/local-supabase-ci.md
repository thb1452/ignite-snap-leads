# Ephemeral Supabase HTTP integration

Status: **prepared; first CI execution pending**. This is a local Docker stack on
a disposable standard GitHub runner, not a deployed hosted staging project.

The workflow is limited to a public repository and a standard `ubuntu-24.04`
runner. GitHub documents this use as free. It uses no Supabase account login,
project linking, paid branch, hosted provisioning, repository secrets, Lovable
prompt or Lovable credits. It starts only synthetic local services and deletes
their data volumes afterward. Artifact retention is one day.

Supabase CLI **2.117.0** selects its versioned local images, including PostgreSQL
17.6, GoTrue 2.196.0, PostgREST 16.2 and Edge Runtime 1.74.3. Its CLI help and
generated configuration were checked before implementation. The configuration
disables automatic public-table grants and relies on the baseline/candidate's
explicit grants. Managed Auth functions, `auth.users` columns and constraints are
fingerprinted before and after fixture bootstrap; they must remain identical.

The existing selected application fixture and three unchanged candidate
migrations run in filename order. Only the fixture's exact role/Auth bootstrap
prefix is omitted, with a checksum guard. Customer accounts and password/refresh
tokens then come from real GoTrue HTTP requests. API checks use actual PostgREST
and the local function gateway, rather than a transport stub or manually invented
customer JWT. The copied checkout and retired-worker handlers remain unchanged
and use their repository `verify_jwt` settings.

The planned checks cover distinct signup workspaces, forged metadata, anonymous
and foreign-account denial, private contacts/notes, ordinary-property handoff,
atomic outcome retry/stale conflicts, refresh identity, synthetic service-only
billing replay, closed checkout, gateway JWT rejection, internal-worker guards
and an Auth ban evaluated against an existing token. A fake local Stripe key
allows the unchanged checkout handler to reach its closed database gate; no
actual provider credentials or payments are used.

The receipt explicitly excludes managed hosted deployment, browser behavior,
Storage, realtime, original municipal lineage, source acceptance, actual payment,
useful customer delivery and restorable-backup verification. Properties, unlocks
and source-lineage validation still use the labeled synthetic fixture. These
checks cannot authorize market release, reopen checkout or replace the buyer
pilot. A passing receipt must be tied to the tested commit.

Run through `.github/workflows/release-supabase-local.yml`. Its artifacts contain
only the test result and synthetic receipt; local keys, status output, raw service
logs and Auth identities are not uploaded. If Docker is unavailable locally,
syntax/configuration checks alone are not a passing integration result.

Official references checked September 24, 2026:

- [Supabase automated testing in Actions](https://supabase.com/docs/guides/deployment/ci/testing)
- [Local function configuration](https://supabase.com/docs/guides/functions/function-configuration)
- [CLI reference](https://supabase.com/docs/reference/cli/introduction)
- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [Explicit Data API grants](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
- [Gateway change: CLI local services are unaffected](https://supabase.com/changelog/48048-self-hosted-supabase-envoy-becomes-the-default-api-gateway-b)
