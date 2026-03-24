const STORAGE_KEY = "snap_single_unlock_checkout";
const TTL_MS = 60 * 60 * 1000;

type Pending = { sessionId: string; propertyId: string; at: number };

/** Call right before redirecting to Stripe Checkout (single unlock). */
export function setPendingStripeUnlockCheckout(sessionId: string, propertyId: string): void {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ sessionId, propertyId, at: Date.now() } satisfies Pending)
    );
  } catch {
    /* Safari private mode, etc. */
  }
}

/** Session id to POST to handle-unlock, if it matches this property and is fresh. */
export function getPendingStripeUnlockSessionId(propertyId: string): string | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Pending;
    if (p.propertyId !== propertyId || !p.sessionId) return null;
    if (Date.now() - p.at > TTL_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return p.sessionId;
  } catch {
    return null;
  }
}

export function clearPendingStripeUnlockCheckout(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* */
  }
}
