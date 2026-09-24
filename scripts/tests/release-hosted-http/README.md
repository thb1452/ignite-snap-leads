# Isolated hosted HTTP acceptance

This harness is opt-in and **has not been run remotely by its author**. It is limited to the operator-approved, newly blank staging project, selected synthetic schema and reviewed functions. It is not a production migration, source release, payment test or full Supabase clone. No database password is used.

The first request reads the service-only `public.snap_hosted_fixture` marker. Its exact nonce, kind, schema version and `state=ready` must match the private configuration before any other request, including Auth user creation. There is no environment/repository fallback URL or key. Project references and private credentials must not be put in this directory.

## Prerequisites

1. Root/operator creates the approved isolated zero-cost project and applies the reviewed baseline from `scripts/tests/release-hosted/`, its exact candidate migrations and the additive fixture self-role lookup repair. Managed Auth stays intact; email confirmation settings are not disabled. The fixture helper is not claimed to be a production repair.
   Apply `20260924214048_snap_crm_outcome_conflict_v1.sql` after the original CRM workflow: the stale-outcome assertion requires `409` / `PT409`. Do not run the stale competitor against the older `40001` implementation; affected hosted PostgREST versions may retry it indefinitely. A migration change does not prove an already-looping request stopped; the operator must reconcile and stop only the precisely identified synthetic backend before a fresh run.
2. Read the marker nonce privately. Service role must have SELECT on the marker and fixture profiles/activities; it must have INSERT on synthetic `properties` and `unlocked_properties`. Customers retain the actual candidate RLS. Do not change policies just to pass a check.
3. Deploy the reviewed `test-pipeline` (`verify_jwt=false`), `create-checkout-session` (`verify_jwt=true`) and `send-sms-threaded` (`verify_jwt=true`) with their shared modules. Preserve function holds. The configured commit is an operator assertion: the harness cannot recover a deployed source checksum from HTTP responses.
4. Keep real provider credentials and schedulers absent/inert. No Lovable, support-email, SMS or enrichment credential is needed. Optional positive worker verification can use the exact platform legacy service key or a separately approved internal secret for the **retired endpoint only**. Do not configure a keepwarm or pipeline credential.
5. Place the configuration in a mode-0600 regular file outside the repository, inside a mode-0700 directory. Use a fresh run UUID and never reuse the receipt path. The receipt and persistent lock stay private.

## Private configuration

These are placeholders. Supply actual approved values through the private operator channel; do not commit a filled example or pass keys as CLI arguments.

```json
{
  "version": 1,
  "kind": "snap_hosted_http_acceptance",
  "project_ref": "APPROVED_PROJECT_REFERENCE",
  "api_url": "https://APPROVED_PROJECT_REFERENCE.supabase.co",
  "public_key": "PRIVATE_PUBLISHABLE_OR_PROJECT_ANON_KEY",
  "admin_key": "PRIVATE_SECRET_OR_PROJECT_SERVICE_KEY",
  "fixture_nonce": "UUID_FROM_PRIVATE_MARKER_READ",
  "run_id": "FRESH_UUID",
  "expected_commit": "REVIEWED_40_CHARACTER_COMMIT",
  "receipt_file": "/PRIVATE_MODE_0700_DIRECTORY/hosted-http-receipt.json",
  "operator_approval": {
    "scope": "isolated_synthetic_http",
    "max_cost_usd": 0,
    "confirmed_new_blank_project": true
  },
  "checkout_expectation": "configuration_closed"
}
```

Optional fields: `internal_worker_secret`, `legacy_service_key`, and `function_commits`. `expected_commit` identifies the harness source. For independently deployed function revisions, supply `function_commits` with exactly `test-pipeline`, `create-checkout-session` and `send-sms-threaded` mapped to their 40-character source commits. The receipt keeps these operator-recorded revisions separate; it does not pretend HTTP responses proved the deployment hashes. Modern `sb_secret_…` and `sb_publishable_…` values go in `apikey`, never in `Authorization`. Actual user access JWTs go in `Authorization: Bearer …`. Legacy JWT keys are checked for matching project/role before use, then validated by the service itself.

`checkout_expectation=configuration_closed` expects the existing handler's exact `SERVER_MISCONFIGURED` response when Stripe credentials are absent. It records `BLOCKED_STRIPE_CONFIGURATION`, not a passed checkout hold. Switch to `database_hold` only when the separate approved configuration safely allows a valid user to reach `503 checkout_paused`; that still does not run payments.

## Run and inspect

Offline safety tests make no network calls:

```sh
node --test scripts/tests/release-hosted-http/runtime.test.mjs
node --check scripts/tests/release-hosted-http/http-integration.test.mjs
```

Only the authorized operator runs the hosted suite:

```sh
SNAP_HOSTED_HTTP_RUN=1 \
SNAP_HOSTED_HTTP_CONFIG_FILE=/PRIVATE_MODE_0700_DIRECTORY/hosted-http-config.json \
  node --test scripts/tests/release-hosted-http/http-integration.test.mjs
```

Without explicit opt-in the hosted test is skipped, not passed. JSON receipt status is authoritative: `PASS_BOUNDED_HTTP_SCOPE`, `PARTIAL`, `FAIL` or `UNCERTAIN`. Node exit success with `PARTIAL` means selected safe checks ran while named gates remain blocked. Do not turn it into a complete hosted acceptance claim.

The receipt is written before work, after each check, and **before each HTTP request**. Its operation journal records a monotonic number, method, fixed route template without query/host, known synthetic request/lead/property IDs, and intent/acknowledgement/uncertain checkpoints. Outcome and stale-command UUIDs therefore survive a lost response. A journal write failure stops before the request; a failure after dispatch remains uncertain. The receipt includes private target/run identifiers and acknowledged synthetic user/property IDs, but no keys, passwords, JWTs, request/response bodies or original source data. Keep it private; publish only reviewed test-status summaries. A persistent exclusive `.lock` prevents accidental reruns. There is no automatic retry, cleanup or rerun. Review exact synthetic run identities before scheduling a fresh run; canonical data readback does not retroactively prove that an interrupted replay/stale test completed. An acknowledged unexpected function response stops further function probes, records `FAIL`, and still allows independent ban/logout checks on the synthetic users. An uncertain request stops the entire run.

## Observations covered

- Auth-admin-created, confirmed **synthetic** email users; real password login, Auth identity, token refresh and separate workspace/default roles despite forged user metadata.
- Anonymous/customer privilege denial and bidirectional property/lead/contact/activity isolation.
- Fixture role lookup returns the caller's own user role but never another account's role or a forged admin role; anonymous execution is denied.
- Own-property unlock requirements; exact manual-outcome replay produces one activity, while stale or foreign commands fail without partial work.
- Server-owned profile identity cannot be reassigned; service REST verifies the canonical result.
- Database checkout gate stays closed. API-key-only customer access must receive exact 401 rejection; its gateway or handler layer is recorded. The forged JWT must receive an identifiable gateway 401. A genuine user must separately reach the expected closed handler response. Retired worker guard and communications hold have exact response checks.
- A real Auth-admin ban of a user created in this run fences that user's already-issued JWT from CRM through the database's user-state check.
- Global logout rejects subsequent refresh. The existing migration does **not** check `auth.sessions`; the receipt separately observes whether a still-valid access JWT retains workspace access. This is not claimed as immediate token revocation.

The run retains synthetic data for private operator review; it does not delete users or fixtures automatically. The second synthetic user remains temporarily banned. Resolve any uncertain create/write with the run ID and exact synthetic email pattern before a cleanup or repeat. No real contact, source record, provider object or customer account is used.

## Not established

Admin `email_confirm=true` avoids sending mail and tests trigger/login behavior; it does not verify ordinary signup, inbox delivery, genuine confirmation, OAuth, MFA or browser session lifecycle. This harness does not change confirmation settings or use an invitation/recovery endpoint. It also does not certify source lineage, backup restoration, storage/realtime, native concurrency, full production schema parity, payments or useful customer delivery. Those gates remain separate.

Supabase's [authorization-header reference](https://supabase.com/docs/guides/functions/auth-headers) documents that migration compatibility lets an API key pass `verify_jwt` on either header. Passing that platform check is not a customer identity proof. Keep `verify_jwt` enabled and require handler-level Auth verification before provider configuration/work. Neither an API-key-only handler 500 nor a genuine user's gateway 401 counts as a passed hold.

Current primary references checked: [Supabase changelog](https://supabase.com/changelog.md), [admin create user](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [function authorization](https://supabase.com/docs/guides/functions/auth). The repository's installed Auth client confirms the administrative REST endpoint shapes; no new dependency was installed.
