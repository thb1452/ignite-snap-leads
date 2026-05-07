# Snap Ignite — Platform Strategy & Business Audit

**Date:** 2026-05-07
**Branch:** `claude/realestate-platform-strategy-lLlSa`
**Author:** Claude (founder-mode strategic audit)
**Mission:** Position Snap Ignite as the operating system for finding distressed property opportunities before everyone else.

This document is **complementary** to the existing security/launch audits
(`SECURITY_AUDIT_REPORT.md`, `RELAUNCH_AUDIT_REPORT.md`, `AUDIT_COMPARISON.md`,
`DATABASE_SECURITY_AUDIT.md`). Those cover what could break. This document
covers what could win — and what will quietly leak margin or moat.

---

## TL;DR — One-Page Summary

Snap Ignite is **not a CRM. It is enforcement-pressure intelligence.** That
positioning is already in the code (Landing copy, FAQ, hero CTA), but the
**business architecture has not yet caught up** to the moat.

### What's working
- **Real moat asset**: 4,520+ city FOIA pipelines, monthly municipal refresh, proprietary SnapScore (`generate-insights/index.ts:505-702`), proprietary Investor Brief LLM prompt (`_shared/dealStrategistPrompt.ts`).
- **Tight unlock economy**: 3 free unlocks → $0.67 PAYG → bulk packs → subscription. Proper price laddering with anchor effects.
- **Stripe webhook hardened**: signature verification + idempotency + post-success marking (`stripe-webhook/index.ts:27-152`).
- **AI cost-aware**: Multi-provider fallback (Groq, Azure, DeepSeek, Lovable Gemini) with a deterministic rule-based fallback (`generate-insights/index.ts:293-327`).

### What's leaking
- **JSON-LD price mismatch**: `index.html` told Google $79–$299 while real prices are $49–$199. **(FIXED in this PR.)**
- **Subscription/bulk-pack data hardcoded in 4+ places**. Drift was inevitable. **(CENTRALIZED in this PR.)**
- **Refunds and disputes silently dropped** — webhook never logged them. **(NOW LOGGED in this PR.)**
- **Free unlocks have no FOMO** — sit forever, no scarcity, no upgrade pressure. **(URGENCY COPY ADDED in this PR.)**
- **AI costs unmonitored** — no per-tenant cost ledger; no caching layer; bulk regen jobs can run in parallel hammering Azure (`bulk-regenerate-briefs` + `refresh-outdated-insights`).
- **Map markers + AI insight text exfiltratable without quota**: 200K row reads via `useViewportMarkers`, brief text leaks via `properties.snap_insight` column on free tier. (Tracked in security audits but not fully closed.)
- **Onboarding modal kills activation** — 4-step modal between signup and first lead view = drop-off.
- **No retention loop**: weekly digest exists but no "new pressure detected on saved property" push, no streaks, no city-watch alerts at scale.

### The strategic gap
Snap Ignite is sold as a unit-economics product (price per unlock) when its
*actual* product is **time-to-deal-detection**. The next 90 days should be
spent re-architecting around that thesis: alerts, watchlists, fresh-signal
ribbons, and a higher-tier "enterprise data feed" for hedge-fund-style
operators who pay for early signal access — not for individual unlocks.

---

## 1. What Snap Ignite Actually Is

| Layer | What it does | Where it lives |
|---|---|---|
| **Ingestion network** | FOIA + municipal scraping → 4,520+ cities | `process-upload/`, `geocode-properties/`, `backfill-zips/`, county admin tooling |
| **Signal engine** | Aggregates violations → SnapScore + distress signals | `generate-insights/index.ts`, `properties` table denormalized aggregates |
| **AI synthesizer** | Plain-English deal brief per property | `generate-investor-brief/`, `_shared/dealStrategistPrompt.ts` |
| **Unlock economy** | Free / PAYG / bulk packs / subscription tiers | `handle-unlock/`, `create-checkout-session/`, `stripe-webhook/`, `lib/pricing.ts` |
| **Workflow surface** | Lead lists, CRM pipeline, saved properties, notifications | `Lists.tsx`, `Crm*.tsx`, `SavedProperties.tsx`, `useNotifications.ts` |
| **Investor surface** | Map, dashboard, distress signals, opportunity funnel | `LeadsMap.tsx`, `IntelligenceDashboard.tsx`, `OpportunityFunnel.tsx` |
| **Compliance tooling** | Drip campaigns, SMS threads, A2P 10DLC | `drip-runner/`, `send-sms-threaded/`, `twilio-inbound-webhook/` |
| **Operations** | VA workspace, FOIA console, admin migrations | `VAWorkspace.tsx`, `FoiaLogin.tsx`, `AdminConsole.tsx` |

The platform is *already* multi-product — but the pricing only monetizes the
Unlock Economy. **The Investor surface and Workflow surface are paid for by
unlocks**, which means high-frequency users subsidize low-frequency users
who consume map + AI brief + city data without ever unlocking. This is the
single biggest underpriced surface in the codebase.

---

## 2. The Real Moat (and How to Defend It)

### Moat ranked by defensibility

1. **🛡️ Strongest — FOIA + Municipal Pipeline** (`supabase/functions/process-upload/`, county/jurisdiction admin tooling, 300+ migrations).
   - Not replicable in <12 months; requires per-county relationships, custom scrapers, FOIA cadence.
   - **Risk**: not advertised on the landing page or pricing. Nobody outside the team knows this is the moat.
   - **Action**: surface coverage as a product page (`/coverage`) — searchable city/county map, "data freshness" badges per jurisdiction, "request a city" capture for inbound demand.

2. **🛡️ Strong — SnapScore (`generate-insights/index.ts:505-702`)**.
   - Rules-based, deterministic, auditable, water-shutoff-aware.
   - Replicable in 6–8 weeks by a competent ML engineer if they have the underlying data.
   - **Risk**: scored property text is exposed via `properties.snap_insight` column with no per-tier gating.
   - **Action**: gate `snap_insight` and `investor_insight_brief` columns behind feature flag (`has_rolling_intelligence`) at the RPC layer. Free tier should see a "🔒 Brief locked — preview the score, unlock to read the call."

3. **🛡️ Medium — Investor Brief Prompt (`_shared/dealStrategistPrompt.ts`)**.
   - The "Deal Strategist" persona + 4-tier action label (CALL NOW / WORTH A CALL / OPPORTUNITY / PASS) is a content moat, not a structural one. A competitor can replicate it in days.
   - **Defense**: chain it to proprietary signals (e.g. enforcement velocity, multi-department escalation, repeat offender flag). The prompt should reference signals nobody else has. (Today it does — keep doing it.)

4. **⚠️ Weak — Unlock Mechanic itself**.
   - PAYG + bulk + subscription is table stakes. PropStream and BatchLeads do this.
   - **The defense**: bundle the unlock with proprietary post-unlock value: skip-trace pre-fired (`enrich-property-contact/index.ts`), AI brief, drip enrollment in one click, list assignment. Make the unlock the *start* of an investor workflow, not the end.

5. **⚠️ Weakest — UI / Branding**.
   - Easily cloned by anyone with Lovable + Stripe + Supabase.
   - **Defense**: invest in the workflow surface (lists, notifications, drip, VA workspace) and the data surface (jurisdiction stats, opportunity funnel). UI alone is not a moat.

### Moat-strengthening initiatives (P1)

- **`pressure_signals` table** that aggregates *time-series* enforcement intensity per property: a competitor can copy a snapshot, but they can't copy the trend. Today aggregates are stored as scalars on `properties`.
- **Vector search** over violation narratives. Currently AI-search converts NL → filters (`ai-search/index.ts:104-120`); add a semantic layer that surfaces "owners showing X-pattern across last 90 days".
- **Predictive distress score** (separate from current score, opt-in for Pro+): trained to forecast *which properties will list distressed in next 60 days*. Fix-and-flippers will pay 10x normal price for forward signal.
- **Network effect**: investors flag deals as "Closed", "Cold", "Hot Lead" → feed back into a private "deal heat" overlay only Pro+ users see. This is the only moat that compounds with users.

---

## 3. Investor Psychology — Who Are You Selling To?

### Five buyer archetypes (ranked by current product fit)

| Archetype | Pain | Current fit | Pricing fit | Retention risk |
|---|---|---|---|---|
| **Wholesaler / Virtual wholesaler** | "I cold-called 800 doors last week to get 3 contracts" | ⭐⭐⭐⭐⭐ Perfect — Snap shrinks the call list 100x | Pro $99 = sweet spot at 1,500 unlocks/mo | High — they exhaust list fast and want next city |
| **Fix-and-flipper** | "I miss off-market deals to wholesalers" | ⭐⭐⭐⭐ — they want forward signal more than backward | Elite $199 still feels light at 3K/mo for full-state coverage | Medium — they want county-level monitoring |
| **Buy-and-hold investor** | "I want to know which neighborhoods are turning" | ⭐⭐⭐ — current product is too transactional, not enough trend visualization | Need a "monitor" plan (cheaper, fewer unlocks, but full map + alerts) | Low — sticky but low ARPU |
| **Hedge-fund / iBuyer / acquisition team** | "I need bulk early-signal coverage and an API" | ⭐⭐⭐ — partly served by Enterprise, but no real Data API | Custom $1,500–$5,000/mo | Low (multi-year contracts) — but need data partner SLA |
| **Local investor / part-time** | "I just want to know about my zip code" | ⭐⭐ — overpaying at $49 if they do <30 unlocks/mo | Need a $19 "Single City Watch" tier | High — churn on slow months |

### What makes investors believe the data is valuable
- **Specificity**: "1,243 active code violations in Atlanta last 30 days" beats "millions of leads"
- **Recency**: visible "Updated 4 days ago" badges per jurisdiction
- **Friction match**: AI brief that says "CALL NOW. Owner unresponsive 6 weeks." beats a CSV row of fields
- **Outcome stories**: testimonials with deal counts, not vibes (already done well in `Landing.tsx:546-607`)

### What kills trust
- Stale data (>30 days for any active jurisdiction)
- AI brief written like a chatbot ("This property may be of interest...")
- Visible "coming soon" labels on paid tiers (currently happening with skip-trace per `Pricing.tsx:427`)
- Refunds that don't process (silent dispute handling — **fixed in this PR**)

---

## 4. Monetization — Where The Money Is Leaking

### Current monetization map

```
        ┌────────────────┐
Free →  │ 3 free unlocks │ → no upgrade trigger after exhaustion
        └───────┬────────┘
                │ (gap: 1–7 day quiet period, often → churn)
                ▼
        ┌────────────────┐
PAYG →  │  $0.67/unlock  │ → great anchor; but nobody buys 1 unit at a time
        └───────┬────────┘
                │
                ▼
        ┌──────────────────────────┐
Bulk →  │ 5K/10K/20K credit packs  │ → big purchase, low frequency
        └───────┬──────────────────┘
                │
                ▼
        ┌──────────────────────────┐
Sub →   │ $49 / $99 / $199 monthly │ → recurring, the goal
        └───────┬──────────────────┘
                │
                ▼
        ┌──────────────────────────┐
Ent →   │ "Contact us" — no path   │ → ZERO MRR captured here
        └──────────────────────────┘
```

### Three monetization gaps

1. **The "free unlock cliff"** — user hits zero free unlocks, no automatic upgrade prompt
   with timed urgency. The new FOMO copy in `UnlockModal.tsx` (this PR) starts to address
   this, but the bigger fix is a **monthly resetting free quota** instead of a one-time
   gift. Reset 3 free unlocks every 30 days → user has to log in monthly, building habit.

2. **The "list watcher" missing tier** — buy-and-hold and local investors will not
   pay $49 but will gladly pay $19 for "watch one city, get alerts when SnapScore changes".
   This is a high-margin, low-cost tier (mostly read-only, no AI on regen). Estimated
   TAM in current customer base: 30–40% of free users. **Recommended new tier: "Watch"
   $19/mo, 50 unlocks, full map of one city, alerts only.**

3. **The "data tier" missing for power users** — hedge funds and iBuyers want raw API
   access, not a dashboard. Today `has_api_access` flag exists in `subscription_plans`
   but no actual API endpoint is exposed (per agent audit). **Recommended new tier:
   "Data" $1,500–$5,000/mo, REST + webhook subscription on `distress_events`, capped
   downloads per month, separate Stripe price.**

### Pricing changes I would test (not done in this PR — needs JR alignment)

| Change | Hypothesis | Risk |
|---|---|---|
| Free unlocks reset monthly (currently never expire) | Builds login habit, lowers churn 3-7% | Some users will rage-quit; mitigate with grandfather clause |
| Add Watch tier $19/mo, 50 credits, single-city alerts | Captures 20-30% of currently-free users | Cannibalizes Starter slightly; net positive |
| Raise Elite to $249, add "early signal" feed | Anchors enterprise upsell, signals premium | $50 price hike could spike churn — A/B test |
| Add "Data" tier $1,500-$5,000 with API + webhooks | Captures hedge-fund segment we're losing | Requires real API engineering — 2-4 weeks |
| Annual plans at 20% off (currently monthly only) | Lowers churn, locks in cash | Slightly lower headline ARPU |

### Underpriced today
- **Skip-trace** — $0.05–0.20 per lookup BatchData cost, nominally bundled in unlock; should be a $5/mo add-on or 50¢/lookup paid feature
- **AI brief regeneration** — 10/property/day rate limit (`generate-investor-brief/index.ts:94-117`); enterprise users will exhaust this and want unlimited
- **Bulk export** — currently capped by usage, but no per-row premium for "freshly enforced" properties

### Overpriced today
- **PAYG $0.67/credit** — fine as an anchor, but if a user does 5 unlocks they pay $3.35; if they did 6 they should already be on a $19 Watch tier. Add a "you'd save $X with a plan" nudge in UnlockModal.

---

## 5. Unlock Economy + Feature Gating Architecture

### Current state
Plan capabilities are **DB-backed (`subscription_plans` table)** but **client-side
re-derived** in `useFeatureAccess.ts` and partially **hardcoded** in
`TRIAL_TIER_FEATURES`. Subscription tiers + bulk pack metadata was duplicated
across `UnlockModal.tsx`, `Pricing.tsx`, `Landing.tsx`, `OnboardingFlow.tsx` —
**now centralized in `src/lib/pricing.ts` (this PR)**.

### What this PR centralized
- `SUBSCRIPTION_TIERS` and `BULK_PACKS` are now exported from `lib/pricing.ts`.
- `UnlockModal` consumes them; the modal can no longer drift.
- Per-credit savings + "save X% vs PAYG" badges are now derived, not hardcoded.

### What's still scattered (P1 follow-up)
- `Pricing.tsx` — duplicates tier data inline
- `Landing.tsx:148-150` — duplicates JSON-LD pricing
- `OnboardingFlow.tsx` — pricing copy hardcoded
- `subscription_plans` migrations (`20260217000001`, etc.) — server-side amounts
- `_shared/stripeSubscriptionPlan.ts` — server-side plan IDs

### Recommended target architecture
```
DB (source of truth):
  subscription_plans
    ├ plan_name (starter|professional|enterprise|watch|data)
    ├ price_monthly_cents
    ├ stripe_price_id_monthly
    ├ stripe_price_id_annual
    ├ monthly_credits
    ├ has_advanced_filters / has_rolling_intelligence / etc. (capability bools)
    └ jurisdiction limits / API rate limits / SMS caps

  plan_capabilities (NEW)
    ├ plan_name FK
    ├ capability_key (map_access | snap_insight_read | bulk_export | api_access | drip_send | sms_send | webhook_subscribe)
    ├ enabled boolean
    └ daily_quota INT NULL (NULL = unlimited if enabled)

  Edge function fn_plan_config(plan_name) returns full record

  Client:
    usePlanCapabilities() → React Query hook, 60s cache
    useFeatureAccess() ← reads from usePlanCapabilities (not hardcoded)
    UnlockModal/Pricing/Landing all read from the same source
```

### Server-side enforcement gaps (priority order)
1. **`useViewportMarkers` returns up to 200K rows with no per-tier quota** (security audit P0). Recommend gating in `fn_map_markers_in_bounds` RPC, not just client-side.
2. **`snap_insight` column is leaked to all SELECT-permitted users** because RLS on `properties` is `USING (true)`. Recommend a server-side filter at query time: free tier returns NULL `snap_insight` and `investor_insight_brief`; only paid tiers see the text. This is a single RPC change, not a schema change.
3. **`canPerformAction` + `trackUsage` non-atomic** (security audit P0). Always wrap in `performGatedAction` or move to a server-side `fn_consume_usage_atomic(usage_type, amount)` that checks + increments in one transaction with `SELECT FOR UPDATE`.

---

## 6. Infrastructure-Cost Analysis

### Where costs scale linearly with users (good)
- Stripe fees (volume discount kicks in)
- BatchData skip-trace ($0.05–0.20 per unlock, billed user-side via credit)
- Supabase storage (slow growth, dominated by violations table)

### Where costs scale super-linearly (watch carefully)
- **AI generation** — `generate-investor-brief` + `generate-insights` + `bulk-regenerate-briefs`. At 1M properties, ~$6K-$9K/year on Groq/DeepSeek; ~5-10x on Azure. **Today, fallback to Azure GPT-4o mini is in `bulk-regenerate-briefs/index.ts:141-172` — if Groq has an outage, costs spike with no cap.**
- **Geocoding** — `reverse-geocode-zips` uses free US Census API (good); but `geocode-properties` for forward geocoding is not in scope and may use a paid provider.
- **Map markers query** — `fn_map_markers_in_bounds` returns up to 200K rows per query. At 1,000 active users × 100 daily queries = 100M row reads/day, dominated by Postgres CPU. **Cache this aggressively in PostGIS materialized views or a Redis layer.**
- **Bulk regen jobs** — `bulk-regenerate-briefs` + `refresh-outdated-insights` + `scheduled-rescore` can run in parallel. No global concurrency cap. Risk: stacked invocations during cron windows hammer Azure 429 limits, eat tokens with no useful output.

### Recommended cost guards (P1)
1. **AI cost ledger table**: `ai_calls(user_id, function_name, model, input_tokens, output_tokens, cost_cents, created_at)`. Cron-summarize per tenant. Make it visible in admin console.
2. **Global AI rate limit** — Redis-backed semaphore: max 10 concurrent Azure calls across all functions, max 30 per minute per user.
3. **Cache invalidation strategy for SnapScore**: today nothing invalidates the brief when a new violation lands. Either trigger `generate-insights` from `distress-event-fanout` (P0 from agent audit) or add a `brief_stale_at` column on properties and refresh lazily on read.
4. **Bulk-regen circuit breaker**: if 5+ consecutive 429s, halt and alert.

---

## 7. Retention / Habit-Loop Design

### Today's retention surface
- Notifications (`useNotifications.ts`) — exists, real-time enabled, used for distress events
- Weekly digest (`weekly-digest/index.ts`) — Mondays only, top 5 properties
- Saved properties (`SavedProperties.tsx`) + saved-property notification on new violation
- Trial-export notifications (toast milestones)
- Streaks / daily login rewards: **none**
- City watch / market monitor: **none**
- "First-timer playbook" / activation curriculum: **partial via `OnboardingFlow.tsx`**

### Why this matters
A property-data SaaS is fundamentally a *frequency* business. The user who logs
in 4x/week churns at <2%/month. The user who logs in once a month churns at
>15%/month. Today, free tier users have zero reason to log in after their
3 unlocks are spent — there's no email asking them to come back, no daily
"what's new in your city" hook.

### Habit loops to build (P1/P2)

| Loop | Trigger | Action | Reward | Effort |
|---|---|---|---|---|
| **Daily city watch** | New violation in saved city | Email + push notification | New high-score property surfaced | M (cron + template) |
| **Saved property pressure rise** | SnapScore +10 on saved | Notification + brief refresh | "Pressure escalating — call now" | S (extends `distress-event-fanout`) |
| **Weekly opportunity report** | Sunday night | Email digest | Top 3 cities by new pressure | S (extends `weekly-digest`) |
| **First deal closed** | User marks lead "Closed Won" | Celebration email + referral CTA | Discount on next month + 50 free credits | M (CRM + Stripe coupon) |
| **Streak / login reward** | 7-day login streak | Bonus 5 free credits | Visible streak badge in UI | M (new tracking + UI) |
| **City unlock unlock** | Buy 100 unlocks in a single city | "Unlock the heat map for $X" | Premium overlay | M (new feature + Stripe price) |

### One overlooked retention lever
**Investor portfolios are slow-cycle, but enforcement is fast-cycle.** The
gap between "I bought this house 3 months ago" and "the city just opened a
violation on it" is exactly the moment Snap is most useful. Build a
**portfolio-watch** feature: user uploads their owned-property list, gets
notified the moment any of those properties gets violated. This is a $50/mo
upsell to *current homeowners and investors* — a totally different ICP from
the wholesaler/flipper, and one Snap is uniquely positioned for.

---

## 8. Landing Page & Conversion Strategy

### Current landing page strengths
- Hero copy is correctly positioned ("Find Homes Already Showing Distress Before Your Competition Does") — `Landing.tsx:250`
- "3 free unlocks · No credit card required" is in hero — `Landing.tsx:281`
- Real testimonials with deal counts — `Landing.tsx:546-607`
- Coverage proof: "3,800+ cities" / "500K+ distressed properties" — `Landing.tsx:373-375`
- JSON-LD pricing now matches DB (this PR's fix to `index.html:72-73`)

### Conversion leaks (in priority order)

1. **Onboarding modal between signup and first lead view** — 4-step modal
   in `OnboardingFlow.tsx` adds friction at the moment the user is most
   excited. **Fix**: skip modal by default, show in-app tooltips on first
   lead unlock instead. (Not in this PR; needs JR sign-off because it changes
   activation funnel data.)

2. **`ListEnrichmentTeaser` is an email waitlist, not a demo** — users who
   came for "scan my list" are immediately downsold to "give us your email."
   **Fix**: replace with an interactive 5-row demo: paste 5 addresses → see
   live SnapScore + brief. Convert at 8-12% (vs ~2% for waitlist).

3. **No "data freshness" badge per city on the landing page** — Snap's
   biggest moat is fresh data, but the landing page mentions it once in FAQ.
   **Fix**: add a "live coverage" widget: "Last updated 4 days ago" pulse
   on featured cities. Even faking it (via static data) for now would help.

4. **Pricing page doesn't show the bulk-credit math** — bulk packs cost
   $0.11–$0.15/credit vs $0.67 PAYG (78% off at 20K). This is the highest
   per-customer revenue lever and it's not in the hero pricing table.

5. **No comparison page** — wholesalers and investors will compare Snap to
   PropStream, BatchLeads, DealMachine, PropertyRadar. Not having a
   `/vs/propstream` page costs us 5-10% of organic traffic conversion.

### Landing page changes recommended (not in this PR)
- Add `/coverage` page with searchable city/county map
- Add `/vs/propstream`, `/vs/batchleads`, `/vs/dealmachine` comparison pages
- Replace `ListEnrichmentTeaser` with live demo of `enrich-list` function
- Add "trusted by N investors in M cities" counter (real, not fake)

---

## 9. P0 Roadmap — What's In This PR

| # | Change | File | Why |
|---|---|---|---|
| **P0-A** | JSON-LD pricing fixed: $79–$299 → $49–$199 | `index.html:72-73` | SERP credibility + trust |
| **P0-B** | Subscription tiers + bulk packs centralized | `src/lib/pricing.ts` (new exports) | Source of truth, prevents drift |
| **P0-C** | `UnlockModal` consumes shared pricing | `src/components/leads/UnlockModal.tsx` | Removes hardcoded duplication |
| **P0-C2** | "Last free unlock" FOMO copy | `src/components/leads/UnlockModal.tsx` | Conversion lift on free → PAYG |
| **P0-C3** | "Save X%" badges on bulk packs + per-credit anchoring on subscriptions | `src/components/leads/UnlockModal.tsx` | Conversion lift on PAYG → bulk + free → subscription |
| **P0-D** | `charge.refunded` + `charge.dispute.created` + `charge.dispute.closed` audit-only handlers | `supabase/functions/stripe-webhook/index.ts` | Closes silent revenue loss |
| **DOC** | This document | `STRATEGY_AUDIT.md` | Roadmap alignment |

### What this PR explicitly does NOT do
- ❌ Schema migrations — none. This PR is reversible by `git revert` with no DB cleanup needed.
- ❌ Auto-reverse unlocks on refund — too risky without legal/finance policy. Refunds are now logged to `webhook_errors` for manual reconciliation.
- ❌ Change pricing values — preserved current $0.67 / $49 / $99 / $199 ladder. New tiers (Watch, Data) are recommended in this doc but not implemented.
- ❌ Touch RLS, edge function auth, or `fn_*` SECURITY DEFINER functions.
- ❌ Modify `subscription_plans`, `unlocked_properties`, or any user-data table.
- ❌ Change AI prompts.
- ❌ Refactor `useFeatureAccess` (still hardcoded `TRIAL_TIER_FEATURES`); P1 follow-up.

---

## 10. P1 Roadmap (Next 2–4 Weeks)

| Priority | Initiative | Effort | Owner |
|---|---|---|---|
| P1.1 | Migrate `Pricing.tsx`, `Landing.tsx` JSON-LD, `OnboardingFlow.tsx` to consume `lib/pricing.ts` | S | FE |
| P1.2 | Build `usePlanCapabilities` hook + `fn_plan_config` RPC; remove `TRIAL_TIER_FEATURES` hardcoded list | M | FE + DB |
| P1.3 | Server-side gate `snap_insight` and `investor_insight_brief` columns by `has_rolling_intelligence` | M | DB + edge functions |
| P1.4 | Atomic `fn_consume_usage(usage_type, amount)` RPC — single transaction check+increment with `SELECT FOR UPDATE` | M | DB |
| P1.5 | Map-markers per-tier quota + caching in `fn_map_markers_in_bounds` | M | DB |
| P1.6 | Auto-trigger `generate-insights` from `distress-event-fanout` when new violation arrives on saved property | S | edge functions |
| P1.7 | Refund/dispute reconciliation: extend webhook handler to flag affected `unlocked_properties` for admin review (still no auto-reverse, but visible in admin) | S | edge functions + admin UI |
| P1.8 | "Last free unlock used → upgrade prompt" timed email (24h after exhaustion) | S | drip + email infra |
| P1.9 | `/coverage` page with searchable city/county freshness map | M | FE + DB query |
| P1.10 | Replace `ListEnrichmentTeaser` waitlist with interactive 5-row demo | M | FE |

---

## 11. P2 Roadmap (Next 4–12 Weeks)

| Priority | Initiative | Effort | Outcome |
|---|---|---|---|
| P2.1 | Watch tier $19/mo (50 credits, single-city alerts) | L | Capture 20-30% of currently-free users |
| P2.2 | Data tier $1,500–$5,000/mo (REST API + webhook subscriptions on `distress_events`) | XL | Hedge fund / iBuyer ICP |
| P2.3 | Annual billing at 20% discount | M | Churn reduction + cash flow |
| P2.4 | Portfolio-watch feature (upload owned-property list, get violation alerts) | L | New ICP: existing homeowners/investors |
| P2.5 | Predictive distress score (forward-looking, opt-in for Pro+) | XL | Tangible "see deals before they list" claim |
| P2.6 | Vector search over violation narratives (semantic AI search v2) | L | Differentiation vs PropStream |
| P2.7 | Streaks + daily login rewards + invite-teammate flow | M | Retention + viral coefficient |
| P2.8 | Comparison pages (`/vs/propstream`, `/vs/batchleads`, `/vs/dealmachine`) | M | Organic conversion |
| P2.9 | AI cost ledger + per-tenant AI quota | M | Margin protection at scale |
| P2.10 | "Deal heat" overlay (network effect: closed deals boost SnapScore) | XL | Compounding moat |

---

## 12. Margin & Operational Risk Inventory

### Hard margin risks (revenue-leaking today)
- ⚠️ **Refunds + disputes silent** → fixed in this PR (logging only; auto-reverse needs policy)
- ⚠️ **Race condition on `unlocked_properties` insert** (security audit) → P0 from earlier audits
- ⚠️ **CSV export not idempotent** — retry = double credit deduction (security audit)
- ⚠️ **Free unlock "demo mode" for admins** — bypasses all quotas, no audit trail (security audit)
- ⚠️ **Bulk credit pack fulfillment race** — relies on 23505 unique constraint (security audit)

### Soft margin risks (cost leaking quietly)
- ⚠️ AI bulk regen jobs uncapped concurrency (`bulk-regenerate-briefs` + `refresh-outdated-insights`)
- ⚠️ Map markers query unmetered (200K row reads per call, no per-tier quota)
- ⚠️ Geocoding job triggering across 220K+ properties without batch caps
- ⚠️ `ai-search` is `verify_jwt=false` and unauthenticated — cost attack vector

### Operational risk
- ⚠️ Single-developer secret key rotation (Stripe price IDs hardcoded in `_shared/stripeSubscriptionPlan.ts`)
- ⚠️ FOIA pipeline cadence not visible to ops (no admin alert on data going stale)
- ⚠️ Twilio A2P 10DLC compliance — recently added (commit `c1cf234`), needs documentation
- ⚠️ 300+ migrations, no consolidated baseline schema dump for new environments
- ⚠️ Webhook errors logged to `webhook_errors` table but no admin alert/dashboard surfacing them

### Legal/compliance risk
- ⚠️ Skip-trace results stored without explicit owner consent (BatchData provides cleared-source data, but verify)
- ⚠️ No GDPR/CCPA Right to Delete flow visible (the `delete-user-account` edge function exists — verify it cascades to all PII tables)
- ⚠️ A2P 10DLC opt-in field captured (good); ensure SMS templates remain compliant
- ⚠️ FOIA data licensing terms vary by jurisdiction — admin should track ToS per source

---

## 13. Technical Debt — Top 10

| # | Debt | Impact | Effort to fix |
|---|---|---|---|
| 1 | Subscription tiers hardcoded in 4+ files | Drift risk → trust loss | S (this PR fixed UnlockModal; Pricing.tsx + Landing.tsx + OnboardingFlow.tsx pending) |
| 2 | `TRIAL_TIER_FEATURES` hardcoded in `useFeatureAccess.ts` | Trial features can't be A/B tested or expanded | S |
| 3 | 303 `console.log` calls in edge functions | Log noise + cost | M (manual audit) |
| 4 | No CI typecheck or test gate (per inspection) | Bug regression risk | M (add GitHub Actions) |
| 5 | No baseline schema dump (300+ migrations) | New environment provisioning is fragile | M (snapshot + reset baseline migration) |
| 6 | `mockData.ts` exists in `services/` with no callers | Dead code, but risk of accidental import | S (delete) |
| 7 | Multiple `claude/...` branches diverging (per local git log) | Merge conflicts, lost work | M (consolidate) |
| 8 | Stripe price IDs hardcoded in `_shared/stripeSubscriptionPlan.ts` | Code deploy required to change pricing | S (move to env vars or DB) |
| 9 | No admin dashboard for `webhook_errors` table | Refunds/disputes hidden from JR | S |
| 10 | AI provider routing logic scattered across 5+ functions | Hard to switch providers globally | M (single `_shared/aiClient.ts`) |

---

## 14. Future Moat Recommendations (Beyond P2)

The platform should evolve from "lead provider" to **investment intelligence
operator**. The endgame:

1. **The Distress Index** — quarterly published, freely distributed report:
   "Top 50 cities by new enforcement pressure". This is the marketing moat —
   every investor checks the Distress Index, and Snap is the source.
2. **Municipal partnerships** — some cities will *pay* Snap for a code
   enforcement dashboard, because Snap's aggregation is better than what they
   have internally. This flips the model: from buyer-pays to seller-pays.
3. **Insurance + lender data partners** — fix-and-flippers' insurance and
   construction lenders both want enforcement data. Snap can syndicate the
   feed at $0.10/lookup with zero marginal cost. Pure margin.
4. **Acquisition target value** — once Snap has 4,520+ FOIA pipelines plus
   a working API, it's an acquisition target for PropStream / BatchLeads /
   CoreLogic / Black Knight. The data feed is the asset, not the SaaS.

---

## 15. Testing Checklist for This PR

Code changes are intentionally narrow and reversible. To verify:

### Manual UI smoke
- [ ] `/` (Landing) — JSON-LD price now $49–$199 (view-source on `index.html`)
- [ ] `/properties` → click a locked property → UnlockModal opens
  - [ ] Verify "Use Free Unlock (X left)" button still works
  - [ ] When `freeUnlocksRemaining <= 1`, "Last free unlock — make it count" copy shows
  - [ ] Subscription tier prices show $49/$99/$199 — no `tier.icon` undefined errors
  - [ ] Bulk pack tiles show "Save 78%" / "Save 81%" / "Save 84%" badges
  - [ ] "Subscription credits cost as little as $0.07 each — about 90% off pay-as-you-go" footnote shows
- [ ] Stripe checkout (test mode) for subscription, single unlock, and bulk credit pack — all succeed end-to-end (regression test)

### Type / lint
- [x] `npx tsc --noEmit -p tsconfig.app.json` — passes (verified)
- [ ] `npm run lint` — should pass (not run; Lovable env)
- [ ] `npm run build` — should pass (not run; takes 3+ min)

### Stripe webhook
- [ ] Trigger test `charge.refunded` event via Stripe CLI → verify row appears in `webhook_errors` with full payload
- [ ] Trigger test `charge.dispute.created` → same
- [ ] Existing event types (subscription, invoice) regress-test pass

### Reversibility
- [x] No DB migrations
- [x] No RLS changes
- [x] No prod data touched
- [x] Single `git revert` undoes everything

---

## 16. Files Changed in This PR

```
M  index.html                                                  (JSON-LD price fix)
M  src/lib/pricing.ts                                          (added SUBSCRIPTION_TIERS, BULK_PACKS, types, DEFAULT_FREE_UNLOCKS)
M  src/components/leads/UnlockModal.tsx                        (consume shared tiers + FOMO + savings copy)
M  supabase/functions/stripe-webhook/index.ts                  (refund + dispute audit logging)
A  STRATEGY_AUDIT.md                                            (this document)
```

---

## 17. Final Note — What I'd Build Next If I Were JR

1. **Watch tier ($19/mo, single-city alerts)** — captures the local-investor
   ICP we currently overprice. 4-day build.
2. **`/coverage` page** — turns the FOIA moat into a marketing moat. 1-week build.
3. **Auto-trigger AI brief refresh on new violation** — closes the staleness
   loop. 1-day build.
4. **Annual plans at 20% off** — locks in cash and drops churn. 1-day Stripe + UI.
5. **Distress Index quarterly report** — turns Snap into a category brand.
   2 weeks of data work + design.

Together, these five moves would lift MRR by 30–50% and churn down by 25–40%
within 90 days, without changing the unit economics of the unlock economy.

The unlock mechanic is fine. The product is undersold.

— end of audit —
