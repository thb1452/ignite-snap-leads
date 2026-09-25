/** Release controls stay closed until fulfillment, market approval and payment tests pass.
 * This UI flag does not authorize purchases; the server independently enforces its release gate.
 */
export const CHECKOUT_AVAILABLE = false;
export const CUSTOMER_RECORDS_AVAILABLE = false;
export const AVAILABILITY_MESSAGE = "Customer record access, unlocks, exports, and new purchases are paused while we verify the relaunch. No market is currently approved for customer access.";
export const FREE_ACCOUNT_MESSAGE = "Creating an account is free and does not start a paid trial. Free unlocks are paused with customer record access.";
