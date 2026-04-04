const STORAGE_KEY = "snap_pending_checkout";
const TTL_MS = 60 * 60 * 1000;

type PendingCheckout = {
  type: "subscription" | "bulk_credits";
  at: number;
};

/** Call right before redirecting to Stripe for subscription or bulk credit purchase. */
export function setPendingStripeCheckout(type: PendingCheckout["type"]): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ type, at: Date.now() } satisfies PendingCheckout),
    );
  } catch {
    /* ignore */
  }
}

/** Returns pending checkout info if fresh, then clears it. */
export function consumePendingStripeCheckout(): PendingCheckout | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PendingCheckout;
    if (!p.type) return null;
    if (Date.now() - p.at > TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    localStorage.removeItem(STORAGE_KEY);
    return p;
  } catch {
    return null;
  }
}
