# Public analytics privacy hardening

Prepared 2026-09-24. Implemented locally; no production deployment or Google Analytics account settings changed.

## Default state

Google Analytics is **off** unless the build explicitly supplies `VITE_ENABLE_PUBLIC_ANALYTICS=true`. The unconditional tag in `index.html` is removed. The runtime does not insert a Google script or invoke an existing tracker with the default closed gate. The gate does not enable itself when checkout or market access is approved.

This is deliberate: Google documents that Enhanced Measurement can send browser-history page views independently of `send_page_view: false`. Snap's stream settings and privacy/consent configuration were not verified. Source reviewed 2026-09-24: [Google — Measure pageviews](https://developers.google.com/analytics/devguides/collection/ga4/views), especially “Disable page changes based on browser history events.”

## Before any enablement

1. Inspect the actual Google Analytics web stream and disable automatic Enhanced Measurement capture, including history page views, site search, form interactions, and other automatic events. The local `send_page_view: false` flag alone is insufficient.
2. Verify the site's consent behavior, privacy disclosures, retention/access settings, and whether collecting public acquisition analytics is appropriate for the intended launch. This change is not a consent-management implementation.
3. In a sanctioned isolated environment, inspect network requests while navigating a public page, auth callback with synthetic credentials in query/hash, private CRM record, pricing page and checkout return. Confirm there are no private events, duplicate page views, arbitrary titles, raw URLs/referrers, identifiers, or automatic events.
4. Only then explicitly enable the build flag. Keep the flag absent until evidence supports enabling it.

## Collection policy

- `analyticsPolicy.ts` permits public routes from a fixed list. Unknown, account, CRM, admin, checkout-return, and ambiguous city routes do not produce public analytics events.
- Public page URLs are constructed from the fixed canonical origin and allowlisted route. Query strings and fragments are discarded. Page titles are literals, never `document.title`. Referrer is explicitly blank.
- Custom event names are allowlisted. Fields are fixed enums; unknown keys or values are discarded. A caller cannot override URL, title, or referrer context.
- `payment_success`, `purchase`, arbitrary errors/search terms, user/property identifiers and product-usage events are excluded. A browser's checkout intent is not revenue. Verified billing events must be measured through a separately reviewed server path.
- Loading starts only from an allowed public route and only with the explicit flag. The GA disable flag is set whenever the SPA enters a private path. That runtime measure does not replace verified stream settings.
- First-party `user_activity_log` retains its existing authenticated-user association and action names, but page paths are fixed templates such as `/crm/leads/:id`. Unknown routes are skipped. Raw metadata is no longer persisted by `activityLogger`.
- Query/hash-only changes do not create route page views; React StrictMode effect replays are deduplicated within the page tracker.

## Verification

`node --test tests/analytics-privacy.test.mjs`: 8 tests pass.

The tests cover sensitive query/hash stripping, fixed context, route rejection, enum-only values, overriding/injected metadata, explicit rejection of revenue and private product events, first-party ID removal, and default-off runtime behavior (zero provider loads or tracking calls).

Type checking and targeted ESLint pass. The integration owner runs the final combined build and browser checks. No claim is made that live stream settings, consent behavior, server-side conversion measurement, or published browser network behavior have been verified.

Final local production build passed (8.43 seconds); type check and diff check passed. The integration browser could not open the local preview (`net::ERR_BLOCKED_BY_CLIENT`), so published/request-level analytics behavior remains unverified. The existing first-party error logger was subsequently hardened in this branch: only fixed event/error-class/severity codes and route templates are persisted. Messages, error/component stacks, user agents, caller URLs, and arbitrary metadata are discarded. The existing user association and report destinations remain unchanged; no new telemetry provider or new capture trigger was added. Production ErrorBoundary console output is suppressed; local development diagnostics remain available. Two further leakage tests exercise raw-field rejection, malicious class/event strings, and non-inspection of discarded fields.
