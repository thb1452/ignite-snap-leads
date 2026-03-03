

## Problem: Weekly Digest Authentication Mismatch

### Root Cause

The `pg_cron` job sends the **anon key** as `Authorization: Bearer <anon_key>`, but the `weekly-digest` Edge Function's auth logic requires either:
1. An `x-internal-secret` header matching the **service role key**, OR
2. A valid **admin user JWT** in the Authorization header

The anon key is neither — it's not a service role key and it's not a user JWT. So the function returns **401 Unauthorized** on every cron invocation. The cron reports "succeeded" because the HTTP call itself completed (it got a response), but the function rejected the request.

The analytics from Feb 21 were likely from a manual test invocation before the auth check was tightened.

### Fix

Update the cron job to include the `x-internal-secret` header set to the service role key. This requires:

1. **Drop the existing cron job** (`weekly-digest-email`)
2. **Re-create it** with the correct headers including `x-internal-secret`

Since the service role key is sensitive and must be referenced in the cron SQL, this will be done via a direct SQL insert (not a migration, as it contains secrets).

The cron command will look like:
```sql
SELECT cron.unschedule('weekly-digest-email');

SELECT cron.schedule(
  'weekly-digest-email',
  '0 13 * * 1',  -- Mondays at 1 PM UTC (8 AM ET)
  $$
  SELECT net.http_post(
    url := 'https://ojyxblegxpdgaqiscxpz.supabase.co/functions/v1/weekly-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

If the service role key is not in the vault, we'll use a simpler approach: hardcode the `x-internal-secret` header in the cron job using the actual service role key value (retrieved securely).

### Verification

After fixing, we can manually invoke the function with the correct header to confirm it sends emails successfully.

### Technical Details
- **Cron schedule**: `0 13 * * 1` = Every Monday at 1 PM UTC (8 AM ET)
- **Last successful email send**: Feb 21, 2026
- **Cron executions since**: Feb 23 and Mar 2 (both returned 401 silently)
- **RESEND_API_KEY**: Already configured in secrets

