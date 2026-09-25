/** Single source of truth for PAYG credit price.
 *  Update this constant whenever the price changes — never hardcode $0.67 elsewhere. */
export const PAYG_PRICE_PER_CREDIT = 0.67;

/** Formatted string for display, e.g. "$0.67" */
export const PAYG_PRICE_DISPLAY = `$${PAYG_PRICE_PER_CREDIT.toFixed(2)}`;

/** Compare equivalent credit quantities. Prices are compared in cents to avoid float drift. */
export function subscriptionSavings(credits: number, monthlyPrice: number): number {
  if (!Number.isSafeInteger(credits) || credits < 0 || !Number.isFinite(monthlyPrice) || monthlyPrice < 0) {
    throw new RangeError("A non-negative whole credit allowance and finite price are required");
  }
  return (credits * Math.round(PAYG_PRICE_PER_CREDIT * 100) - Math.round(monthlyPrice * 100)) / 100;
}
