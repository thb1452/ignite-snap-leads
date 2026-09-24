import type { QueryClient } from '@tanstack/react-query';

const privateStorageKeys = [
  'snap_user_roles_cache',
  'snap_checkout_processed',
  'snap_pending_checkout',
  'snap_random_seed',
];

/** Clear all queries, including legacy queries whose keys lacked an account ID. */
export function clearSessionData(
  client: QueryClient,
  storage: Array<Pick<Storage, 'removeItem'>> = [],
) {
  // Cancellation starts synchronously; clear destroys cached query objects.
  void client.cancelQueries();
  client.clear();
  for (const store of storage) {
    for (const key of privateStorageKeys) {
      try { store.removeItem(key); } catch { /* Storage may be disabled. */ }
    }
  }
}
