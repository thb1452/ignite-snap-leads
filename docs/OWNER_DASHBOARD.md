# Owner dashboard

Route: `/admin/operations`. Access it from **Owner dashboard** in the admin sidebar, or **Open owner dashboard** in the Admin Console.

## What is implemented

- Overview, Collection, Agents, News outlets, Data quality, and Your decisions.
- Exact daily recorded send/reply counts, using one explicit UTC reporting window.
- Latest 100 request jobs, agent runs, owner uploads, and review items, with visible record counts and scope.
- Code-violation / water-shutoff / other filters that leave unknown request types unclassified.
- Registered outlet details from selected non-secret columns, with a target of six. Registration is not treated as proof of working mailboxes or verified ownership.
- Agent costs remain unknown if any displayed run lacks a cost. Recent costs are not presented as daily totals.
- Original file names and upload metrics; processed rows are not presented as approved unique records.
- Per-feed failure, empty, loading, and successful-check states. Failure does not become a green status or a zero.
- Refresh every minute while visible, pause control, and manual refresh without page reload.
- Main-app administrator verification through a fresh Auth getUser check and server has_role RPC. Cached roles, subscriptions, and old FOIA/VA signup are not used as access authority.
- The retired VA workspace is removed from administrator navigation. Its existing routes/history are preserved.
- No mutations, requests, payments, retry jobs, or publishing actions are performed.

## Data connection and limitations

The page uses the existing canonical Supabase client and session. Its fallback project is `ojyxblegxpdgaqiscxpz`; environment configuration can override that. It does not silently switch the rest of Snap to the worker project `dqwolscmceelqpkfclgi`.

The management connector could not access the customer project during implementation. Its live table/RLS behavior and end-to-end owner session remain unverified. Worker schema inspection confirmed the monitoring tables exist in the worker project, but no live worker jobs were recorded there at inspection time. The interface therefore shows a persistent coverage notice.

The owner gate is an additional frontend control. Database grants and RLS remain the enforcement boundary. Do not weaken them or add a service-role key to the browser to make missing data appear.

Publishing activity, state assignments across six outlets, mailbox health, complete quality checks, all-worker uploads, and approval execution need verified backend feeds. They are explicitly marked as not connected. Current upload visibility is scoped to the owner's user_id and existing RLS.

Latest-record panels are intentionally bounded; filters apply to the displayed records, not complete nationwide inventory. The old VA foia_requests table is not counted as fresh agent work.

## Validation

- Production build: `npm run build`.
- TypeScript: `npx tsc -p tsconfig.app.json --noEmit`.
- Lint: the three new production files pass ESLint.
- Browser tests: `npx playwright test --config playwright.owner.config.ts`.
- For an existing local Chrome binary, set `PLAYWRIGHT_CHROME_PATH`; otherwise Playwright uses its installed browser.

Browser tests isolate every external request and use synthetic fixtures only. They cover signed-out access, cached-admin spoofing denied by the server role check, section navigation, queue filters, outlets, review details, failed versus empty feeds, missing costs, refresh, and responsive layout.

Screenshots in test-results are **layout previews with synthetic data**, not screenshots of live business activity. They are ignored by Git.

## Before publishing

Verify the intended customer environment, owner sign-in, exact grants/RLS, and feed visibility. Confirm which worker events reach that environment and connect the remaining feeds through an authenticated backend. Keep monitoring-only controls until the corresponding audited actions are implemented.

No database migration, production deployment, or paid service change is included in this patch.
