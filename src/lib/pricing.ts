/**
 * Single source of truth for monetization config.
 *
 * Anything user-facing about pricing — PAYG, subscription tiers, bulk packs —
 * lives here. UI components import from this file. Do NOT hardcode prices,
 * credit amounts, or tier metadata in components or pages.
 *
 * If the price changes in Stripe, update this file and verify:
 *   - src/components/leads/UnlockModal.tsx
 *   - src/pages/Pricing.tsx
 *   - src/pages/Landing.tsx (offers JSON-LD)
 *   - src/components/onboarding/OnboardingFlow.tsx
 *   - index.html (AggregateOffer JSON-LD)
 *   - supabase/functions/_shared/stripeSubscriptionPlan.ts (server-side price IDs)
 */

/** PAYG (pay-as-you-go) credit price in dollars. Server-side equivalent must match Stripe price. */
export const PAYG_PRICE_PER_CREDIT = 0.67;

/** Formatted PAYG price for display, e.g. "$0.67". */
export const PAYG_PRICE_DISPLAY = `$${PAYG_PRICE_PER_CREDIT.toFixed(2)}`;

/** Plan tier name as stored in `subscription_plans.plan_name` and used by the
 *  `create-checkout-session` edge function. Keep in sync with DB enum. */
export type PlanTierName = "starter" | "professional" | "enterprise";

export interface SubscriptionTier {
  /** Internal plan name (matches DB + Stripe metadata). */
  name: PlanTierName;
  /** Display label, e.g. "Pro". */
  label: string;
  /** Monthly price in cents (canonical numeric form). */
  priceCents: number;
  /** Display price, e.g. "$99/mo". */
  priceDisplay: string;
  /** Monthly unlock allowance ("credits"). */
  monthlyCredits: number;
  /** Display credits, e.g. "1,500 credits/mo". */
  creditsDisplay: string;
  /** Effective per-address cost when fully utilized (for psychological anchoring). */
  effectivePerCredit: number;
}

/**
 * Subscription tiers. Order = display order in UnlockModal / Pricing / Landing.
 * Effective per-credit cost shows the discount vs. PAYG ($0.67/credit) — this
 * is the primary psychological lever for upgrade conversion.
 */
export const SUBSCRIPTION_TIERS: readonly SubscriptionTier[] = [
  {
    name: "starter",
    label: "Starter",
    priceCents: 4900,
    priceDisplay: "$49/mo",
    monthlyCredits: 750,
    creditsDisplay: "750 credits/mo",
    effectivePerCredit: 0.065,
  },
  {
    name: "professional",
    label: "Pro",
    priceCents: 9900,
    priceDisplay: "$99/mo",
    monthlyCredits: 1500,
    creditsDisplay: "1,500 credits/mo",
    effectivePerCredit: 0.066,
  },
  {
    name: "enterprise",
    label: "Elite",
    priceCents: 19900,
    priceDisplay: "$199/mo",
    monthlyCredits: 3000,
    creditsDisplay: "3,000 credits/mo",
    effectivePerCredit: 0.066,
  },
] as const;

export interface BulkCreditPack {
  /** Number of credits granted. */
  count: number;
  /** Display label, e.g. "5,000". */
  label: string;
  /** Total price in cents. */
  priceCents: number;
  /** Display price, e.g. "$750". */
  priceDisplay: string;
  /** Per-credit cost in dollars. */
  perCredit: number;
  /** Display per-credit cost, e.g. "$0.15/ea". */
  perCreditDisplay: string;
  /** Percent saved vs. PAYG ($0.67/credit). */
  savingsPercent: number;
}

/**
 * Bulk credit packs — one-time purchase, never expire.
 * Larger packs unlock progressively deeper PAYG discounts (78% off at 20k).
 */
export const BULK_PACKS: readonly BulkCreditPack[] = [
  {
    count: 5000,
    label: "5,000",
    priceCents: 75000,
    priceDisplay: "$750",
    perCredit: 0.15,
    perCreditDisplay: "$0.15/ea",
    savingsPercent: Math.round((1 - 0.15 / PAYG_PRICE_PER_CREDIT) * 100),
  },
  {
    count: 10000,
    label: "10,000",
    priceCents: 130000,
    priceDisplay: "$1,300",
    perCredit: 0.13,
    perCreditDisplay: "$0.13/ea",
    savingsPercent: Math.round((1 - 0.13 / PAYG_PRICE_PER_CREDIT) * 100),
  },
  {
    count: 20000,
    label: "20,000",
    priceCents: 220000,
    priceDisplay: "$2,200",
    perCredit: 0.11,
    perCreditDisplay: "$0.11/ea",
    savingsPercent: Math.round((1 - 0.11 / PAYG_PRICE_PER_CREDIT) * 100),
  },
] as const;

/** Default included free unlocks for a brand-new account. */
export const DEFAULT_FREE_UNLOCKS = 3;
