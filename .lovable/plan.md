
# Snap Ignite Monetization Pivot — Master Plan

## Tier Model (CONFIRMED)

### Free Tier — $0/mo
- 3 free unlocks on signup
- 10 property views/day (modal after limit)
- ❌ No exports
- Scan: 500 addresses/mo (blurred only)
- Save up to 5 properties with email/push alerts

### Starter — $49/mo
- 20 unlocks/month (expire monthly)
- Export up to 10 unlocked leads/month
- Extra unlocks via credits ($1/unlock)
- Full scan access (unblurred for unlocked)
- Unlimited saved properties + notifications

### Pro — $99/mo
- 50 unlocks/month
- Export up to 50 unlocked leads/month
- Extra unlocks/exports via credits
- Map precision for unlocked properties
- Unlimited notifications

### Elite — $199/mo
- ~500–1,000 unlocks/month (soft cap)
- Export up to 200–500 unlocked leads/month
- Additional exports = 1 credit/lead
- Exact coordinates, advanced filtering
- Unlimited notifications

### Credit Packs (never expire)
- $50 → 500 credits
- $100 → 1,200 credits
- $225 → 3,000 credits
- 1 unlock = 1 credit
- 1 export = 1–2 credits (full contact = 2)

### Key Principles
- Unlocks = individual leads
- Exports limited per tier, only on unlocked properties
- Credits = universal currency (unlocks, scans, exports)
- Scarcity drives recurring revenue — no unlimited exports
- Custom enterprise = unlimited export under NDA contract

---

## Phase 1: Database & Core Backend

### 1A. Schema Migrations

**`properties` table — add columns:**
- `street_number TEXT` — parsed from `address`
- `street_name TEXT` — parsed from `address`
- Backfill ~446k rows via regex: `^\s*(\d+\S*)\s+(.+)$`

**`profiles` table — add columns:**
- `free_unlocks_remaining INTEGER DEFAULT 3`
- `daily_view_count INTEGER DEFAULT 0`
- `daily_view_reset_at TIMESTAMPTZ DEFAULT now()`
- `referred_by UUID NULLABLE`

**New table: `unlocked_properties`**
- id, user_id, property_id, unlocked_at, credit_cost (default 1), unlock_source (enum)
- Unique index on (user_id, property_id)
- RLS: users SELECT own; writes via SECURITY DEFINER only

**New table: `transactions`**
- id, user_id, stripe_payment_intent_id (unique), amount, currency, description, metadata (jsonb), status, created_at
- RLS: users SELECT own

**New table: `affiliate_referrals`**
- id, referrer_id, referred_user_id (unique), signup_at, first_purchase_at, commission_paid

**New table: `affiliate_commissions`**
- id, referral_id (FK), transaction_id (FK), amount, commission_rate (default 30), paid_at, status

**Extend `saved_properties`:**
- Add `notify_on_new_violation BOOLEAN DEFAULT true`
- Add `last_notified_at TIMESTAMPTZ`

**New table: `notifications`**
- id, user_id, title, body, link, read_at, created_at
- RLS: users SELECT/UPDATE own

### 1B. Database Functions
- `fn_unlock_property(p_user_id, p_property_id)` — SECURITY DEFINER
- `fn_check_unlocked_batch(p_user_id, p_property_ids UUID[])` — batch lookup
- `fn_record_view(p_user_id)` — lazy daily reset + increment
- `fn_get_property_masked(p_user_id, p_property_id)` — conditional street_number + jitter
- Modify `fn_map_markers_in_bounds` — add is_unlocked + jitter

### 1C. Address Backfill
```sql
UPDATE properties
SET street_number = (regexp_match(address, '^\s*(\d+\S*)\s'))[1],
    street_name   = regexp_replace(address, '^\s*\d+\S*\s+', '')
WHERE street_number IS NULL;
```

---

## Phase 2: Edge Functions & Stripe

### 2A. `handle-unlock` (new)
- Validates auth → checks free unlocks → checks credits → rejects
- Inserts into unlocked_properties, deducts from credit_ledger

### 2B. `create-checkout-session` (modify)
- Add `mode: 'payment'` for single unlock ($5) and credit packs
- Metadata: type, property_id, credits count

### 2C. `stripe-webhook` (modify)
- Handle checkout.session.completed for one-time payments
- Record in transactions table
- Auto-unlock property for single unlock purchases
- Track affiliate first_purchase_at + create commission

### 2D. `monitor-saved-properties` (new, scheduled)
- Daily cron — compare violation counts → generate notifications → send emails

### 2E. Update subscription_plans table
- Starter: $49/mo, 20 unlocks, 10 exports
- Pro: $99/mo, 50 unlocks, 50 exports
- Elite: $199/mo, 1000 unlocks (cap), 500 exports

---

## Phase 3: Frontend

### 3A. Address Blurring
- `useUnlockedProperties` hook — batch check via fn_check_unlocked_batch
- `formatBlurredAddress()` utility — street_name only if locked
- Update PropertyCard, CompactPropertyRow, MobilePropertyCard, PropertyDetailPanel

### 3B. Unlock Modal
- Property summary + options: free unlock, use credit, buy $5 unlock
- Calls handle-unlock or redirects to Stripe

### 3C. View Limit
- Call fn_record_view on detail open
- After 10/day → ViewLimitModal with CTA

### 3D. Map Precision
- Server-side jitter for non-unlocked (±0.005°)
- Exact pins for unlocked

### 3E. Scarcity Badges
- "X investors unlocked this" from aggregate query

### 3F. Credit Balance UI
- Header indicator + buy credits dropdown

### 3G. Pricing Page Redesign
- New tiers + credit packs + comparison table

### 3H. Scan Results
- Blurred addresses + per-row Unlock + bulk Unlock All

### 3I. Affiliate Dashboard (later)
- Referral link, clicks, signups, commissions

### 3J. Notification Center (email-only MVP)
- Bell icon dropdown + notifications page

---

## Implementation Order
1. Database migrations (all tables + columns)
2. Address backfill
3. Database functions (unlock, view tracking, batch check)
4. Edge functions (handle-unlock, modify checkout + webhook)
5. Frontend Phase A: address blurring + unlock modal + credit balance
6. Frontend Phase B: view limits, map precision, scarcity badges
7. Stripe products/prices creation
8. Notifications (email-only MVP)
9. Affiliate system (deferred)
10. Beta testing via is_beta_user → full rollout

---

## Previous SEO Plan (completed)

### Static SEO Pages
- `/municipal-enforcement-data`
- `/off-market-property-leads`
- `/real-estate-distress-signals`
- `/how-investors-find-distressed-properties`

### Programmatic City Pages
- `/code-violations/:citySlug` — dynamic template
- `/code-violations` — city index directory
