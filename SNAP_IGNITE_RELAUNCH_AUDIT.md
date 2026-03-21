# SNAP IGNITE RELAUNCH AUDIT REPORT
**Date:** March 21, 2026
**Auditor:** Claude (automated codebase audit)
**Branch:** `claude/snap-ignite-launch-checklist-hgIw0`

---

## SUMMARY

| Section | Status |
|---------|--------|
| Section 1 — Pricing & Checkout | ❌ FAIL (price IDs are placeholders) |
| Section 2 — Address & Zip Code | ⚠️ PARTIAL (code exists, DB queries needed) |
| Section 3 — AI Investor Brief | ⚠️ PARTIAL (prompt intact, tier thresholds mismatch) |
| Section 4 — Unlock & Export Flow | ✅ PASS (code complete) |
| Section 5 — Notifications | ✅ PASS (table + realtime + RLS all present) |
| Section 6 — List Scan / Enrichment | ✅ PASS (code complete) |
| Section 7 — Property Enrichment API | ❌ FAIL (not built) |
| Section 8 — Admin Panel | ⚠️ PARTIAL (no manual plan override UI) |
| Section 9 — Landing Page & Auth | ✅ PASS |
| Section 10 — General Performance & Bugs | ⚠️ PARTIAL (console.logs remain, isDemoMode bug) |

---

## SECTION 1 — PRICING & CHECKOUT

### ❌ FAIL — Stripe price IDs are still placeholders

**`supabase/functions/create-checkout-session/index.ts` lines 221–226:**
```ts
const STRIPE_PRICE_IDS: Record<string, string> = {
  starter: "price_STARTER_ID",       // ❌ PLACEHOLDER
  professional: "price_PRO_ID",       // ❌ PLACEHOLDER
  enterprise: "price_ELITE_ID",       // ❌ PLACEHOLDER
  elite: "price_ELITE_ID",            // ❌ PLACEHOLDER
};
```

**`supabase/functions/verify-subscription/index.ts` lines 141–145:**
```ts
const PRICE_TO_PLAN: Record<string, string> = {
  "price_STARTER_ID": "starter",       // ❌ PLACEHOLDER
  "price_PRO_ID": "professional",      // ❌ PLACEHOLDER
  "price_ELITE_ID": "enterprise",      // ❌ PLACEHOLDER
};
```
**Action required:** Create real Stripe price IDs for Starter $49, Pro $99, Elite $199 and replace all 4 occurrences across both files.

---

### ⚠️ PRICING MISMATCH — DB vs UI

The latest pricing migration (`20260217000001_update_pricing_and_export_limits.sql`) sets:
- Starter: **$79/mo**
- Pro: **$149/mo**
- Elite: **$299/mo**

But `Pricing.tsx` (the UI) shows:
- Starter: **$49/mo** (150 addresses)
- Pro: **$99/mo** (400 addresses)
- Elite: **$199/mo** (1,000 addresses)

**Action required:** Run an UPDATE on `subscription_plans` to sync DB prices to $49/$99/$199 with `unlock_limit` of 150/400/1000. The DB column is currently `max_monthly_exports` and `max_csv_exports_per_month` — not `unlock_limit` or `export_limit`.

---

### ⚠️ SQL QUERY FROM CHECKLIST WILL FAIL

The checklist query:
```sql
SELECT name, unlock_limit, export_limit FROM public.subscription_plans
WHERE name IN ('starter', 'professional', 'enterprise');
```
The columns `unlock_limit` and `export_limit` **do not exist** in the DB. The actual column names are `max_monthly_exports` and `max_csv_exports_per_month`. This query will error.

**Use instead:**
```sql
SELECT name, max_monthly_exports, max_csv_exports_per_month, price_monthly_cents
FROM public.subscription_plans
WHERE name IN ('starter', 'professional', 'enterprise');
```

---

### Items that cannot be verified without live Stripe/DB access:
- [ ] Stripe price IDs created in Stripe dashboard — **Cannot verify from code**
- [ ] End-to-end checkout flows — **Requires live testing**
- [ ] Stripe webhook firing — **Requires live testing**
- [ ] Failed payment handling — **Requires live testing**

---

## SECTION 2 — ADDRESS & ZIP CODE AUDIT

### ✅ Code Infrastructure Present

- `street_number` and `street_name` columns added to `properties` table in migration `20260320005804`
- `backfill-zips` edge function exists and calls `fn_backfill_zips_by_city_centroids` RPC
- `fn_backfill_zips_by_city_mode` SQL function exists for mode-based backfill
- Backfill handles deduplication correctly (merges violations before deleting duplicates)

### ⚠️ DB Queries Required — Cannot Run Without Live Access

Run these queries in Supabase SQL Editor:

**Count missing zip codes:**
```sql
SELECT COUNT(*) FROM public.properties
WHERE zip_code IS NULL OR zip_code = '';
```
> Note: Check if the column is `zip` or `zip_code` — the properties table uses `zip` based on the codebase. Adjust accordingly.

**Run the street_number/street_name backfill:**
```sql
UPDATE public.properties
SET
  street_number = (regexp_match(address, '^\s*(\d+\S*)\s+(.+)$'))[1],
  street_name = (regexp_match(address, '^\s*(\d+\S*)\s+(.+)$'))[2]
WHERE (street_number IS NULL OR street_name IS NULL)
AND address IS NOT NULL;
```

### ⚠️ NOTE: Column may be `zip` not `zip_code`

The migrations and generate-investor-brief function both reference `zip` (not `zip_code`). Verify the column name before running the count query.

---

## SECTION 3 — AI INVESTOR BRIEF AUDIT

### ✅ System Prompt Intact

`supabase/functions/generate-investor-brief/index.ts` — system prompt is 363 lines, fully intact. Covers:
- Writing style rules ✅
- Action label rules ✅
- Legal guidelines ✅
- Distress signal definitions ✅
- Banned phrases ✅
- Example outputs ✅

### ⚠️ SCORING TIER MISMATCH — Checklist vs Actual Code

The checklist specifies:
- SnapScore 80–100 → HIGH OPPORTUNITY
- SnapScore 60–79 → MONITOR
- SnapScore below 60 → LOW PRIORITY

The **actual system prompt** uses different thresholds:
- Score **70–100** → HIGH OPPORTUNITY
- Score **40–69** → GOOD OPPORTUNITY
- Score **0–39** → WATCH or PASS

**These do not match.** The prompt uses 70/40 breakpoints, not 80/60. Decide which is canonical and update accordingly.

### ✅ Bold Action Label — Every Property

The system prompt enforces: "End every insight with a bold action label" and the rule is non-negotiable. ✅

### ✅ Brief 2–3 Sentences Max

Prompt says: "2-3 sentences maximum. Never write more than 4 sentences." ✅

### ✅ Water Shutoff Gets Higher Score

Override rule in prompt: `enforcement_type = 'water_shutoff' → always HIGH OPPORTUNITY` ✅

### ✅ AI Model in Use

Using Lovable AI Gateway (Gemini 2.5 Pro) at `https://ai.gateway.lovable.dev/v1/chat/completions`. Rate limiting (10/day per property per user) and token logging are implemented.

### Items requiring live testing:
- [ ] Test on 5 live properties — requires live DB access
- [ ] HIGH OPPORTUNITY sort order — code visible but UI sort needs live verification
- [ ] Brief regeneration on new violations — logic present, needs end-to-end test

---

## SECTION 4 — UNLOCK & EXPORT FLOW

### ✅ PASS — All Infrastructure Present

| Item | Status | Notes |
|------|--------|-------|
| Free 3 unlocks | ✅ | `profiles.free_unlocks_remaining` defaults to 3; `useFreeUnlocks` hook reads it |
| UnlockModal | ✅ | Component exists at `src/components/leads/UnlockModal.tsx` |
| handle-unlock function | ✅ | Calls `fn_unlock_property` SECURITY DEFINER RPC |
| BulkUnlockBar | ✅ | Component exists at `src/components/leads/BulkUnlockBar.tsx` |
| 1 unlock = 1 export | ✅ | Stated explicitly in Pricing.tsx footnotes for all tiers |
| PAYG $0.97 | ✅ | `SINGLE_UNLOCK_PRICE = 97` in checkout function |

### Items requiring live testing:
- [ ] Address reveal flow end-to-end
- [ ] CSV export with zip code visible
- [ ] After 3 free unlocks exhausted, modal shows only PAYG/subscription options
- [ ] Bulk unlock with credits — select 5, CSV exports all

---

## SECTION 5 — NOTIFICATIONS

### ✅ PASS — Fully Implemented

| Item | Status | Notes |
|------|--------|-------|
| `notifications` table | ✅ | Created in migration `20260320005804` |
| RLS policies | ✅ | SELECT for own user, UPDATE for read_at |
| `read_at` column | ✅ | Present in schema |
| Realtime enabled | ✅ | `ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;` (migration `20260320013541`) |
| Navigation link on notification | ✅ | `link` column in schema |

### Items requiring live testing:
- [ ] Notification bell in nav shows unread count
- [ ] Save a property → trigger violation → notification fires
- [ ] Click notification navigates correctly
- [ ] Mark all as read — UI interaction
- [ ] Realtime bell update without page refresh

---

## SECTION 6 — LIST SCAN / ENRICHMENT

### ✅ PASS — All Infrastructure Present

| Item | Status | Notes |
|------|--------|-------|
| ListEnrichment page | ✅ | `src/pages/ListEnrichment.tsx` exists |
| CSV upload | ✅ | react-dropzone implemented |
| `enrich-list` edge function | ✅ | Full address normalization + DB matching |
| `enrichment_jobs` table | ✅ | Created in migration `20260314190000` |
| Plan limits configured | ✅ | Trial=500 lifetime, Starter=10k, Pro=50k, Elite=-1 (unlimited) |
| Usage tracking | ✅ | `enrichment_addresses_count` in `subscription_usage` |
| useEffect loop risk | ✅ | `useEffect(() => { ... }, [user?.id])` — stable dependency, not at risk |

### Items requiring live testing:
- [ ] "0 of 0" bug on scan credit counter — needs live check
- [ ] Failed enrichment rows show error state
- [ ] Export of enriched list with full addresses

---

## SECTION 7 — PROPERTY ENRICHMENT API (NEW)

### ❌ FAIL — Not Built

| Item | Status | Notes |
|------|--------|-------|
| `enrich-property-contact` edge function | ❌ | Does **not** exist |
| `property_contacts` table | ✅ | Table exists (referenced in 22 files) |
| Auto-fire on unlock | ❌ | Not wired |
| Display in PropertyDetailPanel | ❌ | Not implemented |
| CSV export includes contact | ❌ | Not implemented |
| Fallback "Contact not available" | ❌ | Not implemented |

### API Recommendation: BatchData vs ATTOM vs Melissa Data

See Section 3 of the deliverables at the end of this report.

**Action required:** Build the `enrich-property-contact` edge function from scratch. The `property_contacts` table schema already exists.

---

## SECTION 8 — ADMIN PANEL

### ✅ Admin Restriction

Admin gate: `user.email !== "juniordorelien@gmail.com"` — redirect enforced in both useEffect and render guard. ✅

### ✅ MRR Display

MRR calculated as sum of `priceMonthlyCents` for all active users. Accurate to what's in DB. ✅

### ✅ Active Subscriber Count

`activeCount` computed in `useMemo` from all users with `status === "active"`. ✅

### ✅ Trials Expiring Within 3 Days

`trialExpiringCount` flags trials where `trialEndsAt <= now + 3 days`. Displayed in red. ✅

### ✅ Per-User Export Activity

`export_logs` table queried per user on row expand. Migration `20260316120000` creates this table. ✅

### ❌ No Manual Plan Override UI

There is no feature in `AdminDashboard.tsx` to manually set a user's plan to Enterprise with a custom unlock limit. Only view is available — no edit functionality.

**Action required:** Add a "Set Plan" action to the admin user row that calls a SECURITY DEFINER RPC to update `user_subscriptions`.

### ⚠️ Pricing mismatch in MRR

If the DB still has the old $79/$149/$299 prices, MRR will show inflated numbers vs actual $49/$99/$199 pricing. Fix the subscription_plans prices first.

---

## SECTION 9 — LANDING PAGE & AUTH

### ✅ PASS — All Clean

| Item | Status | Notes |
|------|--------|-------|
| No waitlist/beta/limited spots copy | ✅ | Searched landing page — zero matches |
| All CTAs go to `/auth` | ✅ | Both desktop and mobile CTAs link to `/auth` |
| "3 free unlocks included" visible | ✅ | Hero: "3 free unlocks included. No subscription needed to browse." |
| Pricing section matches Pricing.tsx | ✅ | Landing page sections include pricing callouts consistent with $49/$99/$199 |
| Signup flow | ✅ | Auth page exists, `useFreeUnlocks` defaults to 3 |

### Items requiring live testing:
- [ ] Email confirmation via Zoho Mail delivery
- [ ] New user lands on leads page after signup

---

## SECTION 10 — GENERAL PERFORMANCE & BUGS

### ❌ FAIL — console.log in Production Edge Functions

**310 total `console.log` statements across 32 edge functions.** Top offenders:
- `process-upload/index.ts`: 124 occurrences
- `export-csv/index.ts`: 14 occurrences
- `geocode-properties/index.ts`: 16 occurrences
- `generate-investor-brief/index.ts`: 4 occurrences

These should be replaced with structured `console.error`/monitoring-only logging or guarded with an env flag before production.

### ⚠️ isDemoMode Bug — May Affect Paying Users

`src/hooks/useDemoCredits.ts`:
```ts
const isDemoMode = isAdmin || (balance ?? 0) < 10;
```

**Problem:** Any paying subscriber who has fewer than 10 credits remaining in their credit balance will be flagged as `isDemoMode = true`. This is incorrect for subscription users.

**Fix needed:** Check subscription status first. If user has an active subscription, `isDemoMode` should be `false` regardless of credit balance.

### ✅ mockData.ts — Not In Production

`src/services/mockData.ts` exists but has **zero imports** in any production file. The file is dead code — never imported anywhere in the app. Safe to leave or delete. ✅

### Items requiring live testing:
- [ ] Mobile flows — all screens on phone
- [ ] Leads page load speed with 100+ properties
- [ ] RLS audit — all tables checked for unauthorized access
- [ ] No infinite loops on enrichment/scan page confirmed by live testing

---

## DELIVERABLE 2 — PROPERTIES MISSING ZIP CODES

This cannot be confirmed without live Supabase access. The infrastructure to fix it is confirmed present:

1. `backfill-zips` edge function calls `fn_backfill_zips_by_city_centroids` RPC
2. `fn_backfill_zips_by_city_mode` function fills zip from most common zip in that city/state
3. Street_number/street_name backfill SQL in checklist is correct and safe to run

**To get the count**, run in Supabase SQL Editor:
```sql
-- Check column name first
SELECT column_name FROM information_schema.columns
WHERE table_name = 'properties' AND column_name IN ('zip', 'zip_code');

-- Then run the count with the correct column name
SELECT COUNT(*) FROM public.properties WHERE zip IS NULL OR zip = '';
```

**To backfill**, call the edge function or run the city-mode RPC for each city/state combination.

---

## DELIVERABLE 3 — API RECOMMENDATION: BatchData vs ATTOM vs Melissa Data

### BatchData
**Pros:**
- Purpose-built for real estate investors
- Owner name, phone, mailing address in one call
- Bulk address lookup API (perfect for the enrich-list use case too)
- RESTful JSON API, easy to integrate
- Designed for skip tracing workflows — matches Snap Ignite's use case exactly

**Cons:**
- Smaller brand than ATTOM
- Pricing not publicly listed — requires sales call for bulk rates
- Data may be less comprehensive in rural or thin markets

**Estimated cost:** ~$0.05–$0.15 per lookup at volume

---

### ATTOM
**Pros:**
- Institutional-grade data (used by PropStream, CoreLogic)
- Deep property details: AVM, ownership history, tax data
- High accuracy on ownership records
- Well-documented API

**Cons:**
- Expensive — typically $500+/mo minimums plus per-call fees
- Overkill for phone/contact lookup; built for property data depth
- API complexity higher than BatchData
- Not designed primarily for skip tracing

**Estimated cost:** $0.25–$0.50+ per property record at low volume

---

### Melissa Data
**Pros:**
- Strong address verification (USPS CASS certified)
- Good for address hygiene/standardization
- Owner name lookup available
- Reasonable per-lookup pricing

**Cons:**
- Phone data is weaker than BatchData
- Better for address cleaning than contact enrichment
- Dashboard/portal more complex
- Not the go-to for real estate investor workflows

**Estimated cost:** ~$0.01–$0.05 per address verification; owner lookup additional

---

### RECOMMENDATION: **BatchData**

**Reason:** BatchData is built specifically for real estate investors doing skip tracing and owner lookup — exactly what the `enrich-property-contact` function needs to do. ATTOM is overkill (and overpriced) for contact-only enrichment. Melissa is best for address verification, not owner contact discovery.

**Implementation path for `enrich-property-contact`:**
1. Get BatchData API key from batchdata.com
2. Call their `/api/v1/property/lookup` or `/api/v1/skip-trace/property` endpoint with address
3. Return: owner name, mailing address, phone (if available)
4. Store in `property_contacts` table (already exists)
5. Wire to fire on unlock in `handle-unlock` function
6. Display in `PropertyDetailPanel` after unlock
7. Include in CSV export

**Fallback:** If BatchData returns no result → insert row with `name = NULL`, `phone = NULL`, display "Contact not available" in UI.

---

## PRIORITY ACTION LIST (Before Relaunch)

### BLOCKERS (must fix before launch):
1. **Replace Stripe placeholder price IDs** in both edge functions (4 total replacements)
2. **Sync subscription_plans pricing** to $49/$99/$199 with correct unlock limits
3. **Fix isDemoMode bug** — don't flag paying users with low credits as demo mode
4. **Build `enrich-property-contact`** edge function (Section 7)

### HIGH PRIORITY (fix this week):
5. **Reduce console.log** in production edge functions — especially `process-upload` (124 occurrences)
6. **Add manual plan override** to admin dashboard
7. **Run zip code audit queries** in Supabase and trigger backfill if needed
8. **Verify scoring tier thresholds** — align system prompt (70/40) vs checklist spec (80/60)

### MEDIUM PRIORITY (fix before full marketing push):
9. Run full end-to-end checkout tests (Starter, Pro, Elite, PAYG)
10. Verify email confirmation delivery via Zoho Mail
11. Mobile QA pass
12. RLS audit pass

---

*Report generated by automated codebase audit. Live Supabase database queries, end-to-end flow tests, and Stripe integration tests require manual verification.*
