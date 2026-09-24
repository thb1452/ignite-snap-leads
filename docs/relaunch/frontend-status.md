# Frontend relaunch hardening — implementation status

Prepared 2026-09-24. These are repository changes on `codex/snap-relaunch-hardening-20260924`, not a production release. No Lovable prompts, credits, deployment, customer messages, or purchases were used by this workstream.

## Implemented

- **Public promises (F01/F02):** Homepage, pricing, About, onboarding, and seven acquisition pages now distinguish municipal evidence from seller intent. Removed unsupported nationwide/property counts, comparative freshness, exclusivity, fictitious distress timelines, and immediate free/paid access claims. Existing brand, homepage sections, and plan prices are retained. Repeated acquisition layouts share one component so availability messaging and button contrast do not drift.
- **One current offer:** A free account does not start a paid trial. Customer record access, free unlocks, exports, and new purchases are explicitly paused. No private import, municipality directory, or case count is represented as released customer coverage. `publicAvailability.ts` keeps both customer data and checkout flags false.
- **Payment-entry containment:** Pricing paid buttons are disabled and handlers return before network calls while checkout is closed. Existing billing management remains reachable. This UI gate is not authorization; the billing workstream's independent server gate is required. No automatic condition opens either gate.
- **Pricing arithmetic (F11):** Like-for-like savings calculate in cents, including Pro $906 and Elite $1,811 against the full allowance at $0.67 per credit. Copy identifies the full-use assumption and lack of guaranteed available records. No plan price changed.
- **Record dates and counts (F03):** The counter describes accessible records added to Snap over 30 elapsed days, using `created_at`; it never calls these new filings. It uses exact counts, rejects missing/malformed counts, provides an unavailable/retry state, keys the query by account, and performs no count request while customer access is held. The public live-feed page does not claim real-time events or expose a raw customer feed.
- **Market routes (F04/F05):** The directory is replaced by a clear market-availability state. Ambiguous legacy city slugs no longer select the first matching city or treat query failures as empty coverage. They resolve to an unavailable explanation and are noindex. No notification subscription is falsely claimed. A released coverage manifest and state/jurisdiction-specific routing remain a future gate, rather than guessed from directory entries.
- **Homepage illustration (F06):** Visible fictional/sample label and example report month; fake interactive controls removed; automatic card flipping stopped. No inferred water-shutoff or customer coverage promise is attached to the example.
- **Metadata (F07):** Removed route-wide contradictory offer/FAQ schema from static HTML. SEOHead cleans route metadata on unmount. RouteMetadataBoundary, mounted by the integration workstream, allows indexing only for listed public paths; private, unknown, and ambiguous city paths receive noindex/nofollow. The raw SPA shell defaults to noindex and public pages opt in during rendering. This complements authorization and does not replace it. Server-rendered SEO/headers remain outside this patch.
- **Accessibility and layout (F10/F12/F16):** How Snap Works and Referrals no longer nest AppLayout inside the existing protected-route layout. Homepage and app mobile drawers use the existing Radix Sheet for focus containment, Escape and focus return; controls have accessible labels. Workspace links identify the current page. Acquisition pricing buttons have an explicit dark background/contrast treatment.
- **Signup honesty:** Removed phone/SMS opt-in fields that were never submitted by the signup handler. The form clearly says signup does not enroll SMS. Existing authentication and consent records were not changed. Reintroducing SMS signup requires durable, auditable consent capture and separately authorized delivery work.
- **Analytics coordination:** The static GA setup disables its automatic initial page view so the integration workstream can send sanitized public route views.

## Verification completed

- `node --test tests/public-release.test.mjs`: 4 tests pass (credit-price comparisons and invalid input, exact ingestion window, unknown/count rounding behavior, public/private route classification).
- `npx tsc --noEmit -p tsconfig.app.json`: pass after shared CRM edits resolved in-progress integration errors.
- `npm run build`: pass. This demonstrates compilation/bundling, not customer workflow correctness or performance.
- Targeted ESLint across all files owned/touched by this workstream: pass without errors or warnings.
- `git diff --check`: pass at verification time.
- Source scan: no unsupported 3,800/500K/4,520 or trial claims remain on the public and onboarding surfaces reviewed. Historical admin AuditReport retains old audit contents and is not treated as current release evidence.

## Required before release

1. Browser verification at desktop/mobile sizes of `/`, `/pricing`, `/code-violation-leads`, `/code-violations`, an ambiguous legacy city path, and `/auth?mode=signup`; inspect contrast, focus/Escape/return, no horizontal overflow, route metadata reset and noindex.
2. Signed-in role and account-switch testing for app navigation, counter unavailable state, CRM routes, and absence of duplicate navigation. No signed-in production browser test was completed by this workstream.
3. Source/market review, signed-in fulfillment proof, and payment sandbox tests must pass before replacing the current hold messages or opening flags. A frontend boolean cannot substitute for per-account server authorization or approved market access.
4. Verified published coverage needs stable state/jurisdiction identifiers, a public summary contract, and matching sitemap behavior. Retired city-only pages currently expose no customer data and make no coverage claim.
5. Existing legal terms (including refund and SMS terms) were not rewritten. Product availability messaging does not remove existing contractual duties.

The integration owner may append supported browser results to this report. Until those results exist, rendered accessibility, screen-reader behavior, and authenticated end-to-end journeys remain unverified.

## Analytics follow-up

The initial `send_page_view: false` adjustment has been superseded by a stronger default-off runtime loader. The HTML no longer loads Google Analytics. See `analytics-privacy.md`: public events use a strict route/event/enum policy and fixed context; first-party activity logs use route templates and drop raw metadata. Six additional privacy tests pass. Stream settings and consent/privacy verification are required before the explicit build flag may be enabled.

## Integration browser attempt

The integration owner attempted the supported browser preview at `http://127.0.0.1:8080`; navigation returned `net::ERR_BLOCKED_BY_CLIENT`. No alternate browser, tunnel, or bypass was used. Therefore desktop/mobile rendered layout, keyboard focus/Escape/return, screen-reader behavior, and authenticated journeys remain unverified. Compilation and pure logic tests do not close this gate.

## Final error telemetry follow-up

The existing first-party error logger now stores only fixed event/error-class/severity codes and route templates. Raw messages, stacks, full URLs, user agents, and arbitrary metadata are discarded; capture destinations and existing user associations are unchanged. The analytics/privacy suite now has 8 passing tests, including raw-field getter and injection cases. All frontend changes are frozen for integration.
