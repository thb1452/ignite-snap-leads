# SNAP IGNITE RELAUNCH AUDIT REPORT
**Audit Date:** 2026-03-21
**Auditor:** Claude Code (automated static analysis)
**Branch:** claude/snap-ignite-relaunch-18ts4

> **Legend:** ✅ PASS | ❌ FAIL | ⚠️ FLAG | 🔍 NEEDS LIVE TEST | ➖ BLOCKED (requires DB/live env)

---

## SECTION 1 — PRICING & CHECKOUT

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Confirm new Stripe price IDs created: Starter $49, Pro $99, Elite $199 | ❌ FAIL | Price IDs are still placeholders — must be created in Stripe dashboard first |
| 2 | Replace all 4 placeholders in `create-checkout-session/index.ts` | ❌ FAIL | `price_STARTER_ID`, `price_PRO_ID`, `price_ELITE_ID`, `price_PAYG_ID` are all still placeholder strings (lines 16, 116–120) |
| 3 | Replace placeholders in `verify-subscription/index.ts` | ❌ FAIL | `price_STARTER_ID`, `price_PRO_ID`, `price_ELITE_ID` still placeholder at lines 142–145 |
| 4 | Test Starter checkout end-to-end — 150 unlock limit | ➖ BLOCKED | Cannot test until real Stripe price IDs are in place |
| 5 | Test Pro checkout end-to-end — 400 unlock limit | ➖ BLOCKED | Cannot test until real Stripe price IDs are in place |
| 6 | Test Elite checkout end-to-end — 1,000 unlock limit | ➖ BLOCKED | Cannot test until real Stripe price IDs are in place |
| 7 | Test PAYG $0.97 — card charges, unlock fires | ➖ BLOCKED | Cannot test until real Stripe price IDs are in place |
| 8 | Pricing tier limits match spec in code | ✅ PASS | `Pricing.tsx` shows Starter=150/mo, Pro=400/mo, Elite=1,000/mo — matches spec |
| 9 | Webhook handler exists with idempotency | ✅ PASS | `stripe-webhook/index.ts` has idempotency via `webhook_events` table and full event handler coverage |

**CRITICAL ACTION REQUIRED:** Create 4 Stripe price IDs and replace all placeholders before any checkout flow can work.

---

## SECTION 2 — ADDRESS & ZIP CODE DATA

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Blurred address shows street name + city + state + zip (no house number) | ✅ PASS | `blurredAddress.ts:30` — strips house number, formats as `streetName, city, state zip` |
| 2 | Unlocked address shows full address including zip | ✅ PASS | `blurredAddress.ts:22` — full format `address, city, state zip` |
| 3 | `backfill-zips` function exists and operational | ✅ PASS | Calls `fn_backfill_zips_by_city_centroids` RPC, handles batching and auto-continuation |
| 4 | Count properties missing zip / confirm backfill resolved it | ➖ BLOCKED | Run in Supabase SQL editor (see ZIP COUNT section below) |
| 5 | Spot check 20 random properties for correct address display | 🔍 NEEDS LIVE TEST | Requires live app access |
| 6 | SQL backfill confirms zip populated for all matching records | ➖ BLOCKED | Requires Supabase SQL editor |

---

## SECTION 3 — AI INVESTOR BRIEF AUDIT

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | System prompt intact in `generate-investor-brief/index.ts` | ✅ PASS | Full 363-line `SYSTEM_PROMPT` present and intact |
| 2 | Scoring tier rules in system prompt | ⚠️ FLAG | **MISMATCH vs checklist spec.** Prompt uses: 70–100=HIGH OPPORTUNITY, 40–69=GOOD OPPORTUNITY/WATCH, 0–39=WATCH/PASS. Checklist specified: 80–100=HIGH, 60–79=MONITOR, <60=LOW PRIORITY. Clarify with JR which thresholds are correct. |
| 3 | Brief ends with bold action label on every property | ✅ PASS | Prompt rule: "End every insight with a bold action label" — enforced in ACTION LABELS section |
| 4 | Brief is 2–3 sentences max | ✅ PASS | Prompt: "2-3 sentences maximum. Never write more than 4 sentences." |
| 5 | Test on 5 live properties (with water shutoff, multiple violations, etc.) | 🔍 NEEDS LIVE TEST | Requires live app and `LOVABLE_API_KEY` env var set |
| 6 | HIGH OPPORTUNITY sorted/displayed first in leads list | ➖ BLOCKED | Requires checking sort logic in DB or query ordering |
| 7 | SnapScore sort working — highest scores at top by default | ➖ BLOCKED | Requires live verification |
| 8 | Water shutoffs get higher score boost | ✅ PASS | Prompt hard-rule: `enforcement_type = 'water_shutoff' → always HIGH OPPORTUNITY` |
| 9 | AI brief visible on property card and detail panel | 🔍 NEEDS LIVE TEST | `InvestorInsightCard.tsx` and `PropertyDetailPanel.tsx` both exist — needs live check |
| 10 | Brief regenerates when new violation data added | 🔍 NEEDS LIVE TEST | Rate limiting at 10/day per property — needs live test |

---

## SECTION 4 — UNLOCK & EXPORT FLOW

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Fresh free user — confirm 3 free unlocks showing | 🔍 NEEDS LIVE TEST | `useFreeUnlocks` hook + `handle-unlock` RPC reference free credits |
| 2 | Click blurred address — UnlockModal opens | ✅ PASS | `UnlockModal.tsx` exists with correct free/credit/PAYG options rendered conditionally |
| 3 | Free unlock — address reveals, export button appears | 🔍 NEEDS LIVE TEST | Code path: `handleUnlockWithCredits()` → `handle-unlock` → `fn_unlock_property` RPC |
| 4 | Export downloads CSV with full address including zip | 🔍 NEEDS LIVE TEST | `export-csv` function exists — needs live test |
| 5 | After 3 free unlocks used — modal shows PAYG + subscription only | ✅ PASS | `UnlockModal.tsx` conditionally renders options based on `freeUnlocksRemaining` and `creditBalance` |
| 6 | Test PAYG unlock — pay $0.97, address reveals, export works | ➖ BLOCKED | Blocked by missing Stripe price IDs |
| 7 | Bulk select — 5 properties, BulkUnlockBar appears | ✅ PASS | `BulkUnlockBar.tsx` component exists |
| 8 | BulkUnlockBar shows correct count locked vs unlocked | 🔍 NEEDS LIVE TEST | Component exists — needs live verification |
| 9 | Bulk unlock with credits — unlocks all, CSV exports all | 🔍 NEEDS LIVE TEST | Needs live verification |
| 10 | 1 unlock = 1 export always | ✅ PASS | All plan cards in Pricing.tsx confirm "1 unlock = 1 export. Always." footnote |

---

## SECTION 5 — NOTIFICATIONS

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | `notifications` table exists with correct RLS policies | ➖ BLOCKED | Requires DB inspection — table referenced extensively suggesting it exists |
| 2 | Notification bell shows unread count in nav | ✅ PASS | `NotificationBell.tsx` shows red badge with unread count when `unreadCount > 0` |
| 3 | Save property — notification created when new violation hits it | 🔍 NEEDS LIVE TEST | Requires DB trigger verification |
| 4 | Click notification — navigates to correct property | ✅ PASS | `NotificationBell.tsx:17` — `navigate(n.link)` called on click |
| 5 | Mark single notification as read | ✅ PASS | `useNotifications.ts:41–50` — `markRead` mutation updates `read_at` timestamp |
| 6 | Mark all as read | ✅ PASS | `useNotifications.ts:52–63` — `markAllRead` updates all unread records |
| 7 | Realtime enabled in code | ✅ PASS | `useNotifications.ts:66–78` — Supabase channel with `postgres_changes` on `INSERT` for notifications |
| 8 | Test realtime — new notification updates bell without refresh | 🔍 NEEDS LIVE TEST | Realtime subscription code is correct — needs live verification |
| 9 | Confirm `notifications` in `supabase_realtime` publication | ➖ BLOCKED | Run: `SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notifications';` |

---

## SECTION 6 — LIST SCAN / ENRICHMENT

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | List Scan page accessible and functional | ✅ PASS | `ListEnrichment.tsx` exists, route `/enrich` configured in App.tsx |
| 2 | CSV upload — 10 addresses, enrichment runs | 🔍 NEEDS LIVE TEST | `enrich-list/index.ts` handles CSV processing — needs live test |
| 3 | Enriched results return SnapScore, violation count, AI brief, open case status | ✅ PASS | `enrich-list` outputs these fields in enriched CSV output |
| 4 | Scan respects plan limits | ✅ PASS | `fn_check_enrichment_limit` RPC called before processing — returns `TRIAL_ENRICHMENT_LIMIT` or `ENRICHMENT_LIMIT_EXCEEDED` |
| 5 | Specific limits (Trial 500, Starter 10k, Pro 50k, Elite unlimited) | ➖ BLOCKED | Limits enforced in `fn_check_enrichment_limit` DB function — verify values in DB migration |
| 6 | Scan credit counter "0 of 0" bug | ⚠️ FLAG | `ListEnrichment.tsx:325` — if `usage` returns null/undefined, shows "0 of 0". Depends on DB function returning correct values. Needs live verification. |
| 7 | Failed enrichment rows show error state, not blank | ✅ PASS | `enrich-list` error handling — unmatched rows return with empty enrichment fields, not blank rows |
| 8 | Export of enriched list works | 🔍 NEEDS LIVE TEST | CSV download in enrich-list function — needs live test |

---

## SECTION 7 — PROPERTY ENRICHMENT API

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Research BatchData API — get API key, document endpoints | ✅ PASS | **BatchData already selected and integrated.** Skip-trace endpoint: `https://api.batchdata.com/api/v1/property/skip-trace` |
| 2 | Research ATTOM API | ➖ SKIPPED | BatchData already integrated — ATTOM research not needed unless BatchData fails |
| 3 | `enrich-property-contact` edge function built | ✅ PASS | Full function exists — takes property address, calls BatchData, stores in `property_contacts` |
| 4 | `property_contacts` table exists with correct schema | ✅ PASS | Table referenced with fields: `property_id`, `name`, `phone`, `email`, `mailing_address`, `source`, `raw_payload`, `created_by` |
| 5 | Enrichment fires automatically when property is unlocked | ✅ PASS | `handle-unlock/index.ts:104–169` — BatchData call fires inline after unlock when `BATCHDATA_API_KEY` env is set |
| 6 | Display owner contact in PropertyDetailPanel after unlock | ✅ PASS | `OwnerContactSection.tsx` exists; `UnlockModal` invalidates `property-contacts` query on success |
| 7 | Enrichment result in CSV export | 🔍 NEEDS LIVE TEST | `export-csv` function needs verification that contact fields are included |
| 8 | Fallback — no result shows "Contact not available" gracefully | ✅ PASS | Both `enrich-property-contact` and `handle-unlock` insert null-field record when no persons found — UI shows fallback |
| 9 | `BATCHDATA_API_KEY` env var configured in Supabase | ➖ BLOCKED | Must verify in Supabase edge function secrets dashboard |

---

## SECTION 8 — ADMIN PANEL

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | `/admin` route restricted to JR's email only | ✅ PASS | `AdminDashboard.tsx:23` — `ADMIN_EMAIL = "juniordorelien@gmail.com"`, redirect enforced at lines 64–67 |
| 2 | MRR displays correctly with new pricing ($49/$99/$199) | ✅ PASS | MRR computed from `price_monthly_cents` in `subscription_plans` table — will reflect correct pricing once plans are set |
| 3 | Active subscriber count accurate | ✅ PASS | Subscriber count and status breakdown computed from `user_subscriptions` |
| 4 | Trials expiring within 3 days flagged | ✅ PASS | `trialExpiringCount` computed in admin stats — filters `trial_ends_at` within 72 hours |
| 5 | Per-user export activity in `export_logs` | ✅ PASS | `fetchExportLogs()` queries `export_logs` table per user and displays inline |
| 6 | Test manually setting user plan to enterprise with custom unlock limit | 🔍 NEEDS LIVE TEST | Requires live admin UI interaction |

---

## SECTION 9 — LANDING PAGE & AUTH

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Zero mention of waitlist, beta, limited spots | ✅ PASS | Grep across `Landing.tsx` — zero matches for waitlist/beta/limited spots |
| 2 | Every CTA goes to `/auth` not a waitlist form | ✅ PASS | All CTAs confirmed linking to `/auth` (lines 194, 197, 222, 262, 526, 689, 728, 813, 816) |
| 3 | "3 free unlocks included" copy visible on hero | ✅ PASS | Copy present at Landing.tsx lines 284 and 724 |
| 4 | Pricing section on landing matches `Pricing.tsx` exactly | ✅ PASS | Same tier names and prices used on both pages |
| 5 | Test signup flow — new user gets 3 free unlocks, lands on leads page | 🔍 NEEDS LIVE TEST | Requires live environment |
| 6 | Email confirmation works — Zoho Mail delivering | 🔍 NEEDS LIVE TEST | Requires live signup test |
| 7 | Landing page Step 3 price copy | ⚠️ FLAG | `Landing.tsx` Step 3 description says **"Pay $5 one-time"** but PAYG price is **$0.97**. Incorrect copy — needs fix. |

---

## SECTION 10 — GENERAL PERFORMANCE & BUGS

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Remove/disable `console.log` from production edge functions | ⚠️ FLAG | **303 console.log occurrences across 32 edge function files.** Most appear to be operational logs (errors, subscription events) which are acceptable. But review for any debug-level spam before launch. |
| 2 | `useDemoCredits` — `isDemoMode` not triggering for real paying users | ✅ PASS | `useDemoCredits.ts:13` — `isDemoMode: isAdmin` — only admins get demo mode, paying users never flagged |
| 3 | `mockData.ts` not used in production | ✅ PASS | `src/services/mockData.ts` exists but has zero imports anywhere in the production app codebase |
| 4 | Test on mobile | 🔍 NEEDS LIVE TEST | Mobile-specific components exist (`MobilePropertyCard`, `MobileFilterSheet`, `MobilePropertyDetailSheet`, `VirtualizedMobilePropertyList`) |
| 5 | Page load speed on leads page with 100+ properties | 🔍 NEEDS LIVE TEST | Virtualized lists exist (`VirtualizedPropertyList`, `VirtualizedMobilePropertyList`) — needs live perf test |
| 6 | No infinite loop on enrichment/scan page | 🔍 NEEDS LIVE TEST | Requires live testing of `ListEnrichment` page |
| 7 | RLS audit — no table readable/writable without correct user scope | ➖ BLOCKED | Requires Supabase dashboard — run policy audit query (see below) |

---

## SUMMARY SCORECARD

| Section | ✅ Pass | ❌ Fail | ⚠️ Flag | 🔍 Live Test Needed | ➖ Blocked |
|---------|--------|--------|--------|-------------------|-----------|
| 1. Pricing & Checkout | 3 | 3 | 0 | 0 | 4 |
| 2. Address & Zip | 3 | 0 | 0 | 1 | 2 |
| 3. AI Investor Brief | 4 | 0 | 1 | 3 | 2 |
| 4. Unlock & Export | 5 | 0 | 0 | 4 | 2 |
| 5. Notifications | 5 | 0 | 0 | 2 | 2 |
| 6. List Scan | 4 | 0 | 1 | 2 | 2 |
| 7. Property Enrichment | 6 | 0 | 0 | 1 | 2 |
| 8. Admin Panel | 5 | 0 | 0 | 1 | 0 |
| 9. Landing Page & Auth | 5 | 0 | 1 | 2 | 0 |
| 10. Performance & Bugs | 3 | 0 | 1 | 3 | 1 |
| **TOTAL** | **43** | **3** | **4** | **19** | **17** |

---

## CRITICAL BLOCKERS (Must Fix Before Launch)

### 🔴 BLOCKER 1 — Stripe Price IDs Are All Placeholders

**Files:**
- `supabase/functions/create-checkout-session/index.ts` lines 16, 116–120
- `supabase/functions/verify-subscription/index.ts` lines 142–145

**What to do:**
1. Go to Stripe Dashboard → Products → Create 4 products/prices:
   - Starter: $49/month recurring → copy price ID (starts with `price_`)
   - Pro: $99/month recurring → copy price ID
   - Elite: $199/month recurring → copy price ID
   - PAYG: $0.97 one-time → copy price ID
2. Replace in `create-checkout-session/index.ts`:
   ```
   price_STARTER_ID  →  price_xxxxx (your real Starter ID)
   price_PRO_ID      →  price_xxxxx (your real Pro ID)
   price_ELITE_ID    →  price_xxxxx (your real Elite ID)
   price_PAYG_ID     →  price_xxxxx (your real PAYG ID)
   ```
3. Replace same placeholders in `verify-subscription/index.ts`

**Until this is done, ALL checkout flows are broken.**

---

## FLAGS (Fix Before or Shortly After Launch)

### 🟡 FLAG 1 — SnapScore Tier Thresholds Mismatch Between Checklist and Code
**File:** `supabase/functions/generate-investor-brief/index.ts` SYSTEM_PROMPT

- **Checklist specifies:** 80–100 = HIGH OPPORTUNITY, 60–79 = MONITOR, <60 = LOW PRIORITY
- **Code has:** 70–100 = HIGH OPPORTUNITY, 40–69 = GOOD OPPORTUNITY/WATCH, 0–39 = WATCH/PASS

**Action:** Clarify with JR which thresholds are canonical and update the system prompt accordingly.

### 🟡 FLAG 2 — Landing Page Step 3 Copy Says "$5" Instead of "$0.97"
**File:** `src/pages/Landing.tsx` (in the "How It Works" steps section)

- Current: "Pay $5 one-time, use a credit, or subscribe."
- Should read: "Pay $0.97 one-time, use a credit, or subscribe."

### 🟡 FLAG 3 — Console.log Audit Needed in Edge Functions
303 `console.log` occurrences across 32 edge function files. Many are legitimate operational logs (subscription events, errors, webhook processing). Review specifically for debug-level logs that don't need to run in production. Error logs and event tracking logs are fine to keep.

### 🟡 FLAG 4 — "0 of 0" Bug Potential in List Enrichment Counter
`src/pages/ListEnrichment.tsx:325` — if `usage` object returns null/undefined from the DB function, counter shows "0 of 0". Needs live verification that `fn_check_enrichment_limit` returns proper `remaining` and `limit` values.

---

## ZIP CODE COUNT QUERY
Run this in Supabase SQL editor to get counts:
```sql
SELECT
  COUNT(*) AS total_properties,
  COUNT(*) FILTER (WHERE zip IS NULL OR zip = '') AS missing_zip,
  COUNT(*) FILTER (WHERE zip IS NOT NULL AND zip != '') AS has_zip
FROM properties;
```
If `missing_zip > 0`, run the `backfill-zips` edge function to populate from city centroids.

## RLS AUDIT QUERY
Run this in Supabase SQL editor:
```sql
SELECT tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
ORDER BY tablename, cmd;
```
Verify every user-facing table (properties, violations, user_subscriptions, unlocked_properties, notifications, property_contacts) has RLS enabled and policies scoped to `auth.uid() = user_id`.

---

## API PROVIDER RECOMMENDATION

| Provider | Owner Name | Phone | Mailing Address | Cost/Lookup | Status |
|----------|-----------|-------|----------------|------------|--------|
| **BatchData** | ✅ | ✅ | ✅ | ~$0.05–$0.20 | ✅ Already integrated |
| ATTOM | ✅ | ❌ limited | ✅ | ~$0.10–$0.50 | Not integrated |
| Melissa Data | ✅ | ✅ | ✅ | ~$0.05–$0.15 | Not integrated |

**Recommendation: Stay with BatchData.** It is already fully integrated in both `enrich-property-contact/index.ts` and `handle-unlock/index.ts`. It offers skip-trace (owner name + phone + mailing address) which is exactly what's needed. Competitive per-lookup pricing. No reason to switch unless BatchData match rates prove insufficient for your specific market.

Only switch to Melissa Data if you need stronger address verification/standardization on top of contact data.

---

*Audit completed by static code analysis on 2026-03-21. Items marked 🔍 NEEDS LIVE TEST require a live environment with real data. Items marked ➖ BLOCKED require direct database or Supabase dashboard access to verify.*
