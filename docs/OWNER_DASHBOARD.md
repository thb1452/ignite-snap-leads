# Owner dashboard

Route: `/admin/operations`. This owner monitoring area uses its own verified sign-in and the working operations database. The retired VA signup is not required.

## Access and enforcement

`src/services/owner/client.ts` connects only the owner area to worker project `dqwolscmceelqpkfclgi`, using a public browser key and separate `snap-owner-auth` session storage. The main customer application client is unchanged; its fallback project `ojyxblegxpdgaqiscxpz` did not resolve in the September 5, 2026 check.

An owner creates an account in the owner login form, confirms their email, and signs in. Account creation alone does not grant dashboard access. The deployed `owner-operations` Edge Function verifies the JWT with Auth and requires a confirmed email enabled in the separate `owner_dashboard_access` registry. Legacy VA roles, subscriptions, and user-editable metadata cannot grant access.

The hosted migration `owner_dashboard_access_registry` is recorded in `docs/owner-dashboard-access.sql`. RLS is enabled, browser roles have no table privileges, and only the service role can read the registry. The owner-approved email was registered separately; it is not embedded in source code. No service key is shipped to the browser.

The function allows GET/OPTIONS only, explicit origins, fixed tables and columns, and bounded result sets. The gateway also requires JWT verification. Its access-only check returns no business records. Modern built-in Supabase key dictionaries are used, with legacy environment fallbacks.

## Connected monitoring

- Overview, Collection, Agents, News outlets, Data quality, and Your decisions.
- Recorded daily send/reply counts share one UTC reporting window.
- Latest 100 request jobs, agent runs, uploads, review items, source tasks, and research runs, with exact totals where available.
- Separate code-violation and water-shutoff filters; unknown types remain unclassified.
- Registered agent heartbeat timestamps, mailbox check timestamps and configured limits. Registration and old delivery scores are not proof of current health.
- Failed, blocked, and stale source tasks appear in Your decisions.
- Public website availability and published article metadata from Civic Records and Data Research. Each article query uses that site's own public key, never owner credentials. Drafts, future-dated articles, bodies and contact submissions are excluded. Article routes were verified against the deployed assets.
- Missing costs, failed feeds and unavailable health checks remain explicit. Historical uploads are not counted as fresh approved unique records.
- Refresh every minute while visible, pause control, manual refresh, and mobile layout.

Latest-record filters apply only to displayed rows. The old VA `foia_requests` table is not counted as fresh agent work. No requests, payments, retries, or stories are sent or published by this dashboard.

## Verified recovery findings — September 5, 2026

- Worker project reports ACTIVE_HEALTHY.
- Seven registered agents all have missing heartbeat timestamps.
- Source task history has 1,782 records: 1,647 completed, 79 cancelled, 14 failed, and 42 stale. The 56 failed/stale tasks require review.
- 46 research runs and 6,377 upload records exist; these counts do not establish current collection readiness.
- The new request-job queue has zero records.
- One press account is registered, Civic Records, with a configured daily limit of 50 and no recorded mailbox health check. Six outlets remain a target.
- Civic Records and Data Research website shells respond, but their published-story database hostnames fail DNS resolution. The dashboard surfaces unavailable story feeds rather than inventing zero stories. Ground Truth Ops also fails DNS resolution.

## Validation and release status

Eight backend tests and six browser tests pass, along with app and handler TypeScript checks, owner-code lint, production build, and whitespace checks. Backend tests cover missing/invalid credentials, unconfirmed email, non-owner rejection, approved-owner feeds, partial failure, read-only methods/origins, and separation of publishing credentials. Browser tests cover the access gate, navigation/filtering, unavailable versus empty feeds, costs, refresh, and desktop/mobile layout.

Browser tests use synthetic fixtures and intercept external requests. Screenshots in ignored `test-results` are layout previews, not live business activity.

The registry migration and protected Edge Function have been deployed. Live unauthenticated access returns 401 and the allowed-origin preflight returns 204. A successful owner sign-in and real dashboard response remain to be verified after the owner creates and confirms their account. The frontend is in draft PR 172 and has not been merged or published.

Before release, verify the confirmed owner's authenticated response and feed visibility. Restore the news databases and customer application separately, then reconnect agent heartbeats and mailbox health. Do not treat the monitoring implementation as proof that collection workers or publishing are running.
