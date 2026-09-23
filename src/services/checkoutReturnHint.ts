const HINT_TTL_MS = 60 * 60 * 1000;

/** A return hint is untrusted navigation context, never a payment receipt. */
export function hasCheckoutReturnHint(search: string, pending: unknown, now: number): boolean {
  const params = new URLSearchParams(search);
  if (params.has('credits_added') || params.has('session_id')) return true;
  if (!pending || typeof pending !== 'object' || Array.isArray(pending)) return false;
  const hint = pending as Record<string, unknown>;
  return (hint.type === 'subscription' || hint.type === 'bulk_credits') &&
    typeof hint.at === 'number' && Number.isFinite(hint.at) && Number.isFinite(now) &&
    hint.at <= now && now - hint.at <= HINT_TTL_MS;
}
