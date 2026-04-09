

# Plan: Testimonial Redesign + Pricing CTA Fix

## Two Changes

### 1. Redesign Testimonial Section

Replace the current testimonial cards (lines 538-574) with premium, results-first cards following the exact structure provided.

**New card layout (top to bottom):**
- Result headline (largest, bold text)
- Full name + role + location (no dashes, no abbreviated names)
- Body text (2-3 short conversational lines)
- Metric/result in accent color (no emoji — use text only)

**New section header:** "Real results from investors using Snap Ignite"
**New section footer:** "These results come from focusing on the right properties — not more outreach."

**Design details:**
- Rounded-xl (16px), soft shadow, spacious padding
- Circular avatar with initials, accent background
- Hover: slight lift (`hover:-translate-y-1`)
- Mobile: single column stack. Desktop: 3-column grid
- Metric text uses `text-landing-accent` and larger font weight
- No emoji anywhere in the section

**Three testimonials (exact copy from your spec):**

| Headline | Name | Body | Metric |
|---|---|---|---|
| 3 deals in 6 weeks and I stopped wasting time. | Jake Martinez, Wholesaler, Phoenix AZ | I used to call 100+ people... conversations are completely different. | 3 contracts in 6 weeks |
| We stopped convincing people. We started negotiating. | Sarah Reynolds, Acquisition Manager, Southeast | Before Snap, we were chasing homeowners... | 40% higher contact-to-contract rate |
| This is the first time leads actually made sense. | Marcus Lee, Real Estate Investor | I didn't know who to call before... | First deal closed in under 30 days |

### 2. Fix Pricing CTAs

The user's point: every plan just sends people to `/auth?mode=signup` — nobody goes directly to Stripe. So CTAs like "Buy Credits," "Buy Now," "Get Starter" are misleading. They should all say something like "Start Free" or "Get Started" since the user sees everything for free first and only pays when they unlock.

**Changes:**
- Free tier CTA: "Start Free" (keep as-is)
- PAYG CTA: "Buy Credits" → **"Start Free"**
- Starter CTA: "Get Starter" → **"Start Free"**
- Pro CTA: "Get Pro" → **"Start Free"**
- Elite CTA: "Get Elite" → **"Start Free"**
- Enterprise CTA: "Contact Us" (keep as-is)
- Bulk credit "Buy Now" buttons → **"Get Started"**

This is honest — users sign up free, browse everything, and only see pricing when they click Unlock.

## Files Modified

- `src/pages/Landing.tsx` — testimonial section rewrite + pricing CTA label changes

