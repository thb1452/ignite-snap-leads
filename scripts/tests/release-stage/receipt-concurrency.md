# Native receipt concurrency verification

The `receipt-source-postgres` CI job runs the unchanged, fingerprinted receipt
adapter on a new PostgreSQL 17.6 service with synthetic data. It uses three
independent database sessions. Each of nine race checks must observe both the
expected blocker PID and a waiting lock on the adapter's exact advisory key
before releasing the first transaction. A tenth check rejects repeatable-read
transactions.

The service explicitly uses ICU `en-US`, with `en_US.UTF-8` collation/ctype,
matching the independently inspected hosted staging database. The harness checks
the provider, locale and exact JSON-key ordering before applying application SQL.
Its receipt records the database collation version as well. The initial native
attempt used Docker's default libc `en_US.utf8`, which orders `source_rows` before
`source_row_sha256`; the adapter's exact-key allowlist rejected valid fixtures
before any race ran. The unchanged adapter therefore has a known portability
limit: a target with different key ordering needs a separately reviewed fix or
matching verified configuration. This job does not claim support for every locale.

The checks cover exact and equivalent concurrent handoffs, both orders of source
reading and revocation, denial of queued handoffs after revocation, consumer and
operator bans committed by a third session during the wait, grant revocation,
and acceptance expiry measured against the real database clock. Revocation must
preserve the owner's full lead, contacts and private notes, keep another customer
isolated, hide source annotations and raw source properties, and still allow
private contact edits. Failed handoffs must create no lead, annotation or receipt.

The service accepts only a dedicated loopback `snap_receipt_stage` database and
refuses populated application/Auth namespaces. The offline bootstrap test uses
PGlite to validate these guards and the SQL inputs; it does **not** prove native
concurrency. The native job emits `native-receipt-source-receipt.json` and a test
log only after using separate PostgreSQL connections.

This is an ephemeral SQL/RLS test. Auth identities and JWT helpers are local test
doubles; it does not prove managed Supabase Auth, an HTTP gateway, browser behavior,
original municipal data, delivery, hosted deployment or production readiness.
It does not read provider credentials or contact any production or staging API.
