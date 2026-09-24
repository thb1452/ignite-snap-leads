# Staging verification

Prepared 2026-09-24. **Native multi-session execution is pending a successful CI receipt.** Local isolated SQL regression results are not a hosted staging sign-off.

## Native PostgreSQL concurrency

The read-only production catalog reports PostgreSQL **17.6**, with **read committed** isolation. The local work runtime exposes only UID/GID 0. Package-manager privilege dropping and an ordinary non-root namespace mapping were denied; no PostgreSQL root check or runtime permission was bypassed.

`.github/workflows/release-postgres-stage.yml` supplies a supported Ubuntu runner and the official `postgres:17.6` service. It receives only synthetic local credentials and uses no Supabase, Lovable, Stripe or customer secrets. Workflow permissions are read-only repository access. A pull request targeting `main` (including a draft PR synchronization) or manual dispatch runs the native test and preserves `native-stage-test.log` and `native-stage-receipt.json` in the `native-postgres-concurrency` artifact.

The native test refuses remote targets, an unexpected database name, a nonempty database and an unexpected PostgreSQL version. Three separate backend PIDs are required. Each race must demonstrate the second session blocked on the first using `pg_blocking_pids`, before the first commits. Promise concurrency alone cannot pass these checks.

| Native race | Required result |
| --- | --- |
| Two reviewed provisions for one account | One workspace and an idempotent second result |
| Legacy write overlapping provision | Preflight sees the committed row and refuses reassignment |
| Duplicate property handoff | One lead and one creation event |
| Identical manual outcome requests | One private activity |
| Conflicting manual outcomes | Stale command fails with no partial activity |
| Different webhook events for one purchase | One transaction, receipt and wallet grant |
| Reordered overlapping billing snapshots | Terminal cancellation wins and stays terminal |

## Baseline evidence

`scripts/tests/release-stage/native-catalog-20260924.json` is a fresh authorized SELECT capture of 28 affected public tables, 297 columns and 98 constraints, plus indexes, policies and trigger definitions/hashes. It contains no customer rows or provider credentials. The shared billing baseline builds subscription tables directly from that capture, preserving defaults, checks, foreign keys, overlapping identity indexes and policies. Ledger, transaction, affiliate and webhook definitions are loaded from the existing repository migrations, including the global checkout-session uniqueness index and ledger debit guard.

The tenancy baseline remains a selected synthetic fixture. Managed Auth and complete municipal source lineage are explicitly substituted there. The three candidate migrations run in filename order against that fixture in both PGlite and the native harness. This tests actual candidate PostgreSQL semantics and multi-session locking; it does not claim a full Supabase deployment clone, GoTrue sign-in, PostgREST, realtime or browser completion.

After fixture extraction and the fresh catalog update, the integrated PGlite test passes. The integrated plus tenancy refactor checkpoint had 19 passing Node results. The native harness passes syntax validation; those checks cannot substitute for its CI run.

## Reproduction

Run the workflow on the feature branch and inspect its actual result and artifact. For a separate local PostgreSQL 17.6 installation with a dedicated empty database:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm ci --prefix scripts/tests/release-stage --ignore-scripts --no-audit --no-fund
SNAP_STAGE_DATABASE_URL=postgresql://postgres:synthetic-ci-only@127.0.0.1:5432/snap_release_stage \
  node --test scripts/tests/release-stage/native-concurrency.test.mjs
```

The credential above is for an ephemeral synthetic database only. The script does not accept the production hostname or an operations database.

## Remaining acceptance

Record the CI run URL, exact commit and artifact result before marking native concurrency verified. A passing synthetic native run still leaves hosted migration rehearsal, real Auth/RLS requests, signed-in browser behavior and the separate actual Stripe sandbox exercise to verify. It never authorizes customer data release or paid acquisition.

Implementation references: [Supabase database testing](https://supabase.com/docs/guides/local-development/testing/overview) and [GitHub PostgreSQL service containers](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers). The Supabase changelog was checked before this work; no new API, Realtime schema, extension pinning or deprecated logs endpoint was used.
