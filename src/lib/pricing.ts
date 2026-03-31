/** Single source of truth for PAYG credit price.
 *  Update this constant whenever the price changes — never hardcode $0.67 elsewhere. */
export const PAYG_PRICE_PER_CREDIT = 0.67;

/** Formatted string for display, e.g. "$0.67" */
export const PAYG_PRICE_DISPLAY = `$${PAYG_PRICE_PER_CREDIT.toFixed(2)}`;
