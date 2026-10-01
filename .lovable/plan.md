# Read-only data audit — result: LIVE SELECT UNAVAILABLE

Attempted 2026-10-01 against backend ojyxblegxpdgaqiscxpz. Nothing was edited, migrated, deployed, or invoked.

## Exact error
Built-in read-only SELECT (`select now(), current_database()`):
"The project's database connection pooler is unavailable — the Supabase project is likely paused or still waking up." (SUPABASE_POOLER_UNAVAILABLE; session metadata also failed: status 544, connection timeout)

## Result
```json
{"backend":"ojyxblegxpdgaqiscxpz","query_timestamp":null,"status":"UNAVAILABLE","groups":null,"upload_jobs":null,"source_linkage":null}
```
No counts are inferred; no zeros reported. Stopped as instructed.

## Next step (needs approval, not done)
Check backend status and resume if paused, then rerun the same grouped queries unchanged.
