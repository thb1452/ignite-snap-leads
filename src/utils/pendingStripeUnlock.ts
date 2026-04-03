const STORAGE_KEY = "snap_single_unlock_checkout";
const TTL_MS = 60 * 60 * 1000;

type Pending = { sessionId: string; propertyId: string; at: number };

/** Call right before redirecting to Stripe Checkout (single unlock).
 *  Uses localStorage so the pending state is visible across tabs
 *  (e.g., when checkout opens in a new tab via window.open). */
export function setPendingStripeUnlockCheckout(sessionId: string, propertyId: string): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ sessionId, propertyId, at: Date.now() } satisfies Pending),
    );
  } catch {
    /* ignore */
  }
}

/** Session id to POST to handle-unlock, if it matches this property and is fresh. */
export function getPendingStripeUnlockSessionId(propertyId: string): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Pending;
    if (p.propertyId !== propertyId || !p.sessionId) return null;
    if (Date.now() - p.at > TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return p.sessionId;
  } catch {
    return null;
  }
}

/** Get the pending unlock info regardless of property id (for focus-based polling). */
export function getPendingStripeUnlock(): Pending | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Pending;
    if (!p.sessionId || !p.propertyId) return null;
    if (Date.now() - p.at > TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

export function clearPendingStripeUnlockCheckout(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
