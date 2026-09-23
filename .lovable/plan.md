# Read-only database access check — result: INACCESSIBLE

Checked 2026-09-23 against backend ojyxblegxpdgaqiscxpz. Nothing was edited, migrated, deployed, enabled, or sent.

## Blockers observed
1. Shell database access: connection refused at the pooler with "tenant/user sandbox_exec.ojyxblegxpdgaqiscxpz not found". The read-only role for this sandbox is not provisioned on the pooler right now.
2. Built-in read query tool: "database connection pooler is unavailable" (SUPABASE_POOLER_UNAVAILABLE, status 544, connection timeout). Session start metadata failed the same way.

Both point to the database pooler being unreachable (paused, waking, or unhealthy), which also explains the connector's 499 / request_cancelled.

## Not retrieved (UNKNOWN)
- now() / current_database()
- Private import / source binding / insight function signatures
- Table columns for violations, properties, source_* and intake tables
- generate-insights deployed version/status (no read-only deployment metadata is exposed)

## Next step (needs your approval, not done)
Check backend status and, if paused, resume it (Cloud status / resume action), then re-run the same three read-only queries unchanged.
