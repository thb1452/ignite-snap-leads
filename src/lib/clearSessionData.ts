import type { QueryClient } from '@tanstack/react-query';
import { CRM_OUTCOME_STORAGE_KEY, readOutcomeRecovery } from '../services/crmOutcomeRecovery.ts';

const privateStorageKeys = [
  'snap_user_roles_cache',
  'snap_checkout_processed',
  'snap_pending_checkout',
  'snap_random_seed',
  CRM_OUTCOME_STORAGE_KEY,
];
type SessionStore = Pick<Storage,'removeItem'> & Partial<Pick<Storage,'getItem'|'setItem'>>;
function preserveVerifiedRecovery(store:SessionStore,actor:string|undefined):boolean {
  if(!actor||!store.getItem||!store.setItem)return false;
  try {
    const raw=store.getItem(CRM_OUTCOME_STORAGE_KEY);if(!raw)return false;
    const envelope:unknown=JSON.parse(raw);
    if(!envelope||typeof envelope!=='object'||!('leadId' in envelope)||typeof envelope.leadId!=='string')return false;
    const state=readOutcomeRecovery(store as Pick<Storage,'getItem'|'setItem'|'removeItem'>,actor,envelope.leadId);
    // The helper validates actor, version, IDs, payload and original TTL. It
    // redacts expired draft text without renewing the attempt's creation time.
    return state.status==='pending'||state.status==='expired';
  }catch{return false;}
}
/** Always clear cached queries. Only initial same-user hydration may preserve
 * validated per-tab recovery; logout, switches and failures pass no actor. */
export function clearSessionData(
  client: QueryClient,
  storage: SessionStore[] = [],
  preserveInitialActor?: string,
  recoverySessionStore?: SessionStore,
) {
  void client.cancelQueries();
  client.clear();
  for (const store of storage) {
    const keepRecovery=store===recoverySessionStore&&preserveVerifiedRecovery(store,preserveInitialActor);
    for (const key of privateStorageKeys) {
      if(key===CRM_OUTCOME_STORAGE_KEY&&keepRecovery)continue;
      try { store.removeItem(key); } catch { /* Storage may be disabled. */ }
    }
  }
}
