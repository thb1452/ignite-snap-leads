

## Add 500 Credits to Melissa Allen's Account

**User**: Melissa Allen (`successizunlimited@gmail.com`, ID: `b8706600-5221-4a58-8f5d-1abd24582964`)

### What we'll do

Run a single database migration to insert a row into the `credit_ledger` table:

```sql
INSERT INTO credit_ledger (user_id, delta, reason, meta)
VALUES (
  'b8706600-5221-4a58-8f5d-1abd24582964',
  500,
  'admin_grant',
  '{"note": "Manual admin grant of 500 credits", "granted_by": "admin"}'
);
```

This adds 500 credits to her balance immediately. The `v_user_credits` view sums all ledger deltas, so her balance will reflect this right away — no other changes needed.

### Files changed
None — this is a database-only operation via migration.

