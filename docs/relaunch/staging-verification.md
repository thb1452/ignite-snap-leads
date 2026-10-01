# Staging verification

Verified 2026-09-24. **Native PostgreSQL concurrency passes: seven race scenarios across three independent sessions, eight Node test results including the parent suite.** This is synthetic native database evidence, not a hosted Supabase staging sign-off.

- Run: [36047669169](https://github.com/thb1452/ignite-snap-leads/actions/runs/36047669169), job `107795131960`, all steps successful.
- Pull-request head tested: `bbfd18be090983a78207532d668984823cc76abc` (PR 193).
- Verified artifact: [native-postgres-concurrency](https://github.com/thb1452/ignite-snap-leads/actions/runs/36047669169/artifacts/10829765456), ID `10829765456`.
- Downloaded ZIP SHA-256: `e49e3305baa6256c3e2579769e4e7df005edcd9a4cf258003147662f15dc1d4a`, matched against the GitHub artifact digest.
- Preserved artifact contents: `docs/relaunch/evidence/native-stage-receipt.json` and `docs/relaunch/evidence/native-stage-test.txt`.

## Native PostgreSQL concurrency

The native CI target runs PostgreSQL **17.6**, with **read committed** isolation. The local work runtime exposes only UID/GID 0. Package-manager privilege dropping and an ordinary non-root namespace mapping were denied; no PostgreSQL root check or runtime permission was bypassed.

`.github/workflows/release-postgres-stage.yml` supplies a supported Ubuntu runner and the official `postgres:17.6` service. It receives only synthetic local credentials and uses no Supabase, Lovable, Stripe or customer secrets. Workflow permissions are read-only repository access. A pull request targeting `main` (including a draft PR synchronization) or manual dispatch runs the native test and preserves `native-stage-test.log` and `native-stage-receipt.json` in the `native-postgres-concurrency` artifact.

The native test refuses remote targets, an unexpected database name, a nonempty database and an unexpected PostgreSQL version. Three separate backend PIDs are required. Each race must demonstrate the second session blocked on the first using `pg_blocking_pids`, before the first commits. Promise concurrency alone cannot pass these checks.

| Native race | Verified result |
| --- | --- |
| Two reviewed provisions for one account | One workspace and an idempotent second result |
| Legacy write overlapping provision | Preflight sees the committed row and refuses reassignment |
| Duplicate property handoff | One lead and one creation event |
| Identical manual outcome requests | One private activity |
| Conflicting manual outcomes | Stale command fails with no partial activity |
| Different webhook events for one purchase | One transaction, receipt and wallet grant |
| Reordered overlapping billing snapshots | Terminal cancellation wins and stays terminal |

## Baseline evidence

`scripts/tests/release-stage/native-catalog-20260924.json` supplies the selected schema definitions used by the fixture. It contains no customer rows or provider credentials and does not establish a restorable hosted baseline. The shared billing baseline builds subscription tables directly from that capture, preserving defaults, checks, foreign keys, overlapping identity indexes and policies. Ledger, transaction, affiliate and webhook definitions are loaded from the existing repository migrations, including the global checkout-session uniqueness index and ledger debit guard.

The tenancy baseline remains a selected synthetic fixture. Managed Auth and complete municipal source lineage are explicitly substituted there. The three candidate migrations run in filename order against that fixture in both PGlite and the native harness. This tests actual candidate PostgreSQL semantics and multi-session locking; it does not claim a full Supabase deployment clone, GoTrue sign-in, PostgREST, realtime or browser completion.

After fixture extraction and the fresh catalog update, the integrated PGlite test passes. The integrated plus tenancy refactor checkpoint had 19 passing Node results. The separate CI receipt now verifies PostgreSQL `17.6 (Debian 17.6-2.pgdg13+1)`, read committed isolation, three backend sessions, and observed blocking for all seven races. No hosted or payment result is inferred from that receipt.

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

A passing synthetic native run still leaves hosted migration rehearsal, real Auth/RLS requests, signed-in private browser behavior and the separate actual Stripe sandbox exercise to verify. It never authorizes customer data release or paid acquisition. Any later changes to the candidate SQL or concurrency harness require a new CI receipt for that changed commit.

Implementation references: [Supabase database testing](https://supabase.com/docs/guides/local-development/testing/overview) and [GitHub PostgreSQL service containers](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers). The Supabase changelog was checked before this work; no new API, Realtime schema, extension pinning or deprecated logs endpoint was used.
