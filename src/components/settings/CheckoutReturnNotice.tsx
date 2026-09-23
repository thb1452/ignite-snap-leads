import { useEffect, useState } from 'react';
import { hasCheckoutReturnHint } from '@/services/checkoutReturnHint';

function pendingHint(): unknown {
  try {
    const raw = window.localStorage.getItem('snap_pending_checkout');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** No fulfillment or success branch until a same-user, exact-payment receipt API exists. */
export function CheckoutReturnNotice({ userId, search }: { userId: string | null; search: string }) {
  const [hasHint, setHasHint] = useState(false);

  useEffect(() => {
    const refresh = () => setHasHint(hasCheckoutReturnHint(search, pendingHint(), Date.now()));
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [search, userId]);

  if (!userId || !hasHint) return null;
  return (
    <section role="status" aria-live="polite" className="rounded-lg border p-4 space-y-1">
      <h2 className="font-semibold">Payment confirmation pending</h2>
      <p className="text-sm text-muted-foreground">
        Returning from checkout does not confirm that credits or a subscription were added.
        Payment confirmation is unavailable here until this account's payment receipt can be checked.
      </p>
      <p className="text-sm text-muted-foreground">
        If you already paid, keep your receipt. Avoid paying again just to refresh this page.
      </p>
    </section>
  );
}
