# Snap Ignite — Production Readiness Audit
**Date:** 2026-02-21
**Auditor:** Claude Code
**Branch:** `claude/audit-production-readiness-CCNMG`

---

## Summary

| Area | Status | Severity |
|------|--------|----------|
| Authentication | ✅ PASS | — |
| Stripe Payments & Webhook | ⚠️ PARTIAL | Medium |
| Trial System | ✅ PASS | — |
| Export Limits | ❌ FAIL | **BLOCKER** |
| Edge Functions | ⚠️ PARTIAL | Medium |
| Email | ⚠️ PARTIAL | Medium |
| Environment Variables | ⚠️ PARTIAL | Medium |
| Stripe Price IDs | ⚠️ PARTIAL | Medium |
| Error Handling | ✅ PASS | — |
| Mobile Responsiveness | ✅ PASS | — |

**Blockers that would prevent a real paying customer from successfully signing up and using the product: 1**

---

## 1. Authentication ✅ PASS

**Signup:** AuthForm (`src/components/auth/AuthForm.tsx`) uses `react-hook-form` + Zod with proper validation (email format, min 8 chars, requires number + special char). The `signUp` call routes through Supabase Auth. Email verification is enforced via `EmailVerificationPrompt` before the user can access the app.

**Login:** Standard Supabase `signIn`. Loading timeout (5s) prevents infinite spinner.

**Password Reset:** Two-part flow — user requests reset via `send-password-reset` edge function (sends via Resend with a Supabase admin-generated recovery link), then lands on `/reset-password` which listens for the `PASSWORD_RECOVERY` event and calls `supabase.auth.updateUser`. Password rules (8 chars, number, special char) are enforced on both sides.

**Session Handling:** `useAuth` hook wraps `supabase.auth.onAuthStateChange`. Sessions persist via `localStorage` with `autoRefreshToken: true`. Role caching in `localStorage` with fallback retry logic handles cold-start latency.

**Notes:**
- Loading timeouts (5s on Auth page, 8s on RoleProtectedRoute) are appropriate safeguards.
- The 500ms delay in ResetPassword before checking session is a minor race condition risk on slow connections, but the fallback to redirecting to `/auth` with a toast is handled cleanly.

---

## 2. Stripe Payments & Webhook ⚠️ PARTIAL

**Checkout Flow:** `create-checkout-session` edge function creates a Stripe Checkout session. Auth is verified server-side. Customer deduplication (lookup before create) works. `allow_promotion_codes: true` is enabled. Session URL is returned as both `checkout_url` and `url` for backward compatibility.

**Webhook:** `stripe-webhook` handles `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.payment_succeeded/failed`. Idempotency is tracked via `webhook_events` table with a unique constraint on `event_id`. Signature verification is correctly implemented with `constructEventAsync`.

**Post-Checkout Polling:** `CheckoutSuccess` polls for subscription up to 20 times (1s interval), then calls `verify-subscription` as a fallback. This is a solid double-safety pattern.

**Issues Found:**

**MEDIUM — Annual Billing Is Non-Functional:**
The pricing page shows a Monthly/Annual toggle with "Save 20%" messaging. The `billing_cycle` parameter is accepted by `create-checkout-session` and stored in metadata, but **the function only has one set of Stripe Price IDs** (monthly prices). There are no annual Stripe price IDs configured:

```typescript
// create-checkout-session/index.ts (line 77-83)
const STRIPE_PRICE_IDS: Record<string, string> = {
  starter: "price_1T2kFABg6vwuzzF0LvKvfUsz",
  professional: "price_1T2kEeBg6vwuzzF0fOjHbxBX",
  enterprise: "price_1T2kDvBg6vwuzzF0PyorUdah",
  elite: "price_1T2kDvBg6vwuzzF0PyorUdah",
};
```

If a user selects Annual billing, they get charged the monthly Stripe price ID, not an annual one. The annual pricing shown on the pricing page (`$76/yr` for Starter, etc.) is cosmetic only — Stripe will actually bill monthly. **This must be fixed before promoting annual billing.**

**LOW — Webhook does not handle `trial_will_end` event:** No email reminder is sent when a trial is about to expire. This is a missed retention touchpoint, not a functional blocker.

---

## 3. Trial System ✅ PASS

**Trial Start:** `fn_start_trial` RPC and Stripe's `trial_period_days: 7` both fire when `trial: true` is passed. The checkout session includes trial metadata properly. `TrialSignupModal` handles unauthenticated-to-Stripe-checkout flow cleanly.

**Trial Status Tracking:** `useTrialStatus` calls `fn_get_trial_status` RPC, refreshing every 60 seconds and on window focus. `staleTime: 0` ensures the counter updates immediately after export.

**Trial Expiry:** Server-side: `export-csv` edge function checks `trial_ends_at` before allowing exports and returns `TRIAL_EXPIRED` (403). Client-side: `TrialExportGate` dialog surfaces this to users. `RoleProtectedRoute` intentionally grants expired trial users app access so they can navigate to `/pricing` to upgrade — exports are blocked server-side.

**7-Day Period:** Stripe handles the trial period (`trial_period_days: 7`), and the webhook's `handleCheckoutCompleted` reads `subscription.trial_end` to set `trial_ends_at` in the DB.

**50-Export Trial Limit:** Enforced atomically server-side in `export-csv` via `fn_increment_trial_exports` RPC. Double-checked: client pre-checks `trialExportsRemaining` before initiating the export, and the DB function is the authoritative gate.

---

## 4. Export Limits ❌ FAIL — **BLOCKER**

**What the pricing page claims:**
| Plan | Exports |
|------|---------|
| Starter | 5,000/month |
| Pro | 15,000/month |
| Elite | 25,000/month |

**What the database actually enforces (most recent migration `20260217000001`):**
| Plan | Exports |
|------|---------|
| Starter | 1,500/month |
| Professional | 5,000/month |
| Enterprise | 15,000/month |

The pricing page in `src/pages/Pricing.tsx` (`PRICING_TIERS` array, lines ~37-66) hardcodes `"5,000 monthly exports"`, `"15,000 monthly exports"`, `"25,000 monthly exports"` in the feature lists. These numbers are displayed to every prospective customer.

Migration `20260217000001_update_pricing_and_export_limits.sql` reduced the limits as part of a "PropStream stack positioning" repricing, but **the frontend was never updated to match.**

This is a consumer-facing discrepancy: customers pay for "5,000 exports" and receive 1,500. This will cause immediate refund requests and trust damage.

**Also:** `SubscriptionSettings.tsx` hardcodes price labels as `"Starter - $79/mo"`, `"Pro - $149/mo"`, `"Elite - $299/mo"` — these match the DB prices correctly.

**What needs to be fixed:**
1. Update `PRICING_TIERS` in `src/pages/Pricing.tsx` to reflect the actual DB limits (1,500 / 5,000 / 15,000), OR
2. Update the DB migration to set limits back to what the page claims (5,000 / 15,000 / 25,000).

The Pricing page feature lists also need to match the `subscription_plans.features` JSONB column in the DB (which already reflects the new limits after migration `20260217000001`).

---

## 5. Edge Functions ⚠️ PARTIAL

**Deployed functions checked:**
| Function | Status | Notes |
|----------|--------|-------|
| `create-checkout-session` | ✅ | JWT verified, auth correct |
| `stripe-webhook` | ✅ | Signature verified, idempotency handled |
| `send-support-message` | ✅ | Auth verified, input sanitized, length capped |
| `backfill-zips` | ✅ | Service role auth, self-invokes for next batch via `EdgeRuntime.waitUntil` |
| `send-password-reset` | ✅ | Admin API generates link, Resend delivers |
| `export-csv` | ✅ | Subscription checked, limits enforced server-side |
| `verify-subscription` | ✅ | Good fallback for webhook failures |
| `create-portal-session` | ✅ | Returns 404 cleanly when no Stripe customer |

**Issues Found:**

**MEDIUM — `bulk-generate-missing-insights` has `verify_jwt = false`** in `supabase/config.toml`. This function uses service role access and could be invoked without authentication. It should require JWT verification unless it's only triggered by an internal cron job that uses the service role key directly.

**LOW — Mixed Deno stdlib versions:** Some functions import from `deno.land/std@0.168.0`, others from `@0.190.0`. Not a runtime blocker but can cause inconsistent behavior across upgrades.

---

## 6. Email ⚠️ PARTIAL

**Sending Domain:** Most transactional emails send from `noreply@snapignite.com` via Resend. The domain appears to be the intended production domain. SPF/DKIM setup cannot be verified from code alone — this must be confirmed in the Resend dashboard.

**Issue — Weekly Digest Hardcodes Lovable Domain:**
`supabase/functions/weekly-digest/index.ts` line 261:
```typescript
from: "Snap Ignite <digest@ignite-snap-leads.lovable.app>",
```
And line 9:
```typescript
const APP_URL = Deno.env.get("APP_URL") || "https://ignite-snap-leads.lovable.app";
```

The fallback `from` address is a Lovable staging domain. If `APP_URL` is set correctly in the Supabase secrets, the links in the digest email body will be correct — but **the `from` address is hardcoded and will always read `digest@ignite-snap-leads.lovable.app`** regardless of `APP_URL`. This will fail DMARC/SPF checks for `snapignite.com` and will likely hit spam filters or be rejected.

**Fix:** Change the `from` address in `weekly-digest/index.ts` to `"Snap Ignite <digest@snapignite.com>"` and ensure `digest@snapignite.com` is an authorized sender in Resend.

**Functioning Email Flows:**
- Password reset → `send-password-reset` → Resend → `noreply@snapignite.com` ✅
- Support messages → `send-support-message` → Resend → `noreply@snapignite.com` ✅
- Invitations → `send-user-invitation` → Resend → `noreply@snapignite.com` ✅
- Supabase native auth emails (signup confirmation, magic link) — these are controlled by Supabase SMTP settings, not code. Verify these are configured to send from `snapignite.com` in the Supabase dashboard.

---

## 7. Environment Variables ⚠️ PARTIAL

**Required Edge Function Secrets:**
| Variable | Required By | Status |
|----------|-------------|--------|
| `SUPABASE_URL` | All functions | Auto-injected by Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | All functions | Auto-injected by Supabase |
| `SUPABASE_ANON_KEY` | `export-csv`, `send-user-invitation`, others | Auto-injected by Supabase |
| `STRIPE_SECRET_KEY` | `create-checkout-session`, `stripe-webhook`, `verify-subscription`, `create-portal-session` | Must be set to **live key** (`sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook` | Must be set to live webhook secret (`whsec_...`) |
| `RESEND_API_KEY` | `send-support-message`, `send-password-reset`, `send-user-invitation`, `weekly-digest` | Must be set |
| `APP_URL` | `create-checkout-session`, `create-portal-session`, `send-password-reset`, `weekly-digest` | Must be set to `https://snapignite.com` (or production domain) |

**Issue — Dangerous Fallback in checkout/portal functions:**
```typescript
// create-checkout-session/index.ts, create-portal-session/index.ts
const appUrl = Deno.env.get("APP_URL") || "http://localhost:5173";
```
If `APP_URL` is not set as a Supabase secret, Stripe's `success_url` and `cancel_url` will point to `localhost:5173`. Stripe Checkout will still work (Stripe allows localhost in test mode), but in live mode this would cause the post-payment redirect to fail, leaving customers on a Stripe success page with no redirect. **Confirm `APP_URL` is set as a Supabase secret.**

**Issue — Hardcoded Supabase credentials in client:**
`src/integrations/supabase/externalClient.ts` contains a hardcoded anon key fallback:
```typescript
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_EXTERNAL_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```
The anon key is intentionally public (Supabase RLS protects the data), but hardcoding credentials in source code is poor practice. If the project changes Supabase instances, this fallback will silently point to the old project. Low security risk given RLS, but worth moving to build-time env vars only.

---

## 8. Stripe Price IDs ⚠️ PARTIAL

**Hardcoded price IDs in `create-checkout-session`:**
```
starter:      price_1T2kFABg6vwuzzF0LvKvfUsz
professional: price_1T2kEeBg6vwuzzF0fOjHbxBX
enterprise:   price_1T2kDvBg6vwuzzF0PyorUdah
elite:        price_1T2kDvBg6vwuzzF0PyorUdah  (same as enterprise)
```

These IDs begin with `price_1T2k...` — the format is consistent with live Stripe price IDs. **Verify in the Stripe dashboard that these are live-mode prices** matching the expected billing amounts ($79, $149, $299/month).

**Issue — Annual Prices Not Configured:**
As noted in section 2, there are no annual Stripe price IDs. The `billing_cycle` parameter is accepted but has no effect on which Stripe price is used.

**Issue — `elite` maps to the same price ID as `enterprise`:**
The `elite` key maps to `price_1T2kDvBg6vwuzzF0PyorUdah` which is the same as `enterprise`. The frontend calls the plan `enterprise` in the DB but refers to it as "Elite" in the UI. This mapping is internally consistent (`tier_name.toLowerCase()` would match `enterprise`), but the `elite` alias is redundant and could cause confusion if a customer somehow passes `tier_name: "elite"` — they'd get the enterprise price, which is correct. No functional issue, but clean up the alias.

---

## 9. Error Handling ✅ PASS

**Global Error Boundary:** `ErrorBoundary` wraps the entire app in `App.tsx`. Caught errors show a user-friendly "Something went wrong" screen with "Try again" and "Reload page" buttons. Error details are only shown in development mode (guarded by `process.env.NODE_ENV === "development"`).

**Network Errors:** Checkout flows use `Promise.race` with 15-second timeouts. Failed states show actionable error messages with links back to `/pricing`. No blank white screens observed.

**Export Errors:** All error codes (`EXPORT_LIMIT_EXCEEDED`, `TRIAL_EXPORT_LIMIT_EXCEEDED`, `TRIAL_EXPIRED`, `NO_SUBSCRIPTION`) are caught in the `export.ts` service and converted to typed errors. UI components check for these string codes and show appropriate dialogs (`TrialExportGate`, `UpgradePrompt`).

**Edge Function Errors:** All checked functions return structured JSON with `error` fields and appropriate HTTP status codes. The `switch` on `e?.message` in `create-checkout-session` is clean.

**Loading States:** All auth and subscription loading states have timeouts (5s auth, 8s route protection) so users are never stuck on a spinner indefinitely.

---

## 10. Mobile Responsiveness ✅ PASS

**Pricing Page:** Uses `grid md:grid-cols-3` — cards stack to single column on mobile. Hero section uses `text-3xl sm:text-4xl`. Billing toggle renders correctly at all sizes.

**Leads Page:** Has a dedicated mobile code path (`isMobile` hook, `mobileView` state). Mobile shows `VirtualizedMobilePropertyList` and `MobileFilterSheet`. Map and list toggle present. `MobilePropertyDetailSheet` handles property details. Full mobile implementation exists.

**Settings Page:** Uses `p-4 sm:p-6` padding, `text-2xl sm:text-3xl` headings. Max-width constrained to `max-w-3xl`. Should be usable on mobile.

**Notes:** Cannot verify pixel-perfect rendering without a live browser, but the responsive implementation is thorough. The Leads page in particular has an explicit mobile-first dual layout.

---

## Critical Fixes Required Before Real Customers

### BLOCKER (fix before launch):

**1. Export limit mismatch between pricing page and database**
- File: `src/pages/Pricing.tsx`, `PRICING_TIERS` array
- The page advertises 5k/15k/25k exports but the DB enforces 1.5k/5k/15k
- Either update the frontend feature strings or revert the DB migration

### MEDIUM (fix before promoting these features):

**2. Annual billing is cosmetic — no annual Stripe prices exist**
- File: `supabase/functions/create-checkout-session/index.ts`
- Either add annual Stripe Price IDs and implement the `billing_cycle` branching, or remove the Annual toggle from the UI until it's wired up

**3. Weekly digest `from` address hardcoded to Lovable domain**
- File: `supabase/functions/weekly-digest/index.ts` line 261
- Change to `"Snap Ignite <digest@snapignite.com>"` and authorize in Resend

**4. Confirm `APP_URL` secret is set in Supabase**
- If not set, post-payment redirects will go to `localhost:5173`
- Set via: `supabase secrets set APP_URL=https://snapignite.com`

**5. Confirm Stripe secret key is live mode** (`sk_live_...` not `sk_test_...`)

**6. Confirm Stripe webhook secret is live mode** (`whsec_...` from live dashboard)

**7. Verify Supabase native auth emails use custom SMTP sending from `snapignite.com`**
- Check in Supabase dashboard → Auth → SMTP settings

### LOW (nice to have):

**8. `bulk-generate-missing-insights` has `verify_jwt = false`** — review if this needs public access

**9. Hardcoded Supabase anon key fallback** in `externalClient.ts` — move to env-only

**10. Add Stripe `trial_will_end` webhook event handler** for trial expiry reminder emails
