#!/usr/bin/env node
// Offline report only. Accepts explicitly exported read-only snapshots. No network or apply mode.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const label = id => createHash('sha256').update(String(id)).digest('hex').slice(0,12);
export function reconcileBilling(input) {
  const now=Date.parse(input.observed_at);
  if (!Number.isFinite(now) || !Array.isArray(input.database_subscriptions) || !Array.isArray(input.stripe_subscriptions)) throw new Error('Invalid snapshot envelope');
  const stripe=new Map(input.stripe_subscriptions.map(s=>[s.id,s]));
  const seen=new Set();
  const discrepancies=[];
  for(const row of input.database_subscriptions) {
    const flags=[];
    if (row.stripe_subscription_id && seen.has(row.stripe_subscription_id)) flags.push('duplicate_provider_identity');
    if (row.stripe_subscription_id) seen.add(row.stripe_subscription_id);
    if (['active','trialing','past_due'].includes(row.status) && (!row.current_period_end || Date.parse(row.current_period_end)<=now)) flags.push('expired_local_period');
    const canonical=stripe.get(row.stripe_subscription_id);
    if (!row.stripe_subscription_id) flags.push('provider_identity_missing');
    else if (!canonical) flags.push(input.stripe_export_complete===true ? 'not_in_complete_provider_export_review_required' : 'provider_snapshot_incomplete');
    else {
      const normalized=canonical.status==='canceled' ? 'cancelled' : canonical.status;
      if (normalized!==row.status) flags.push('status_mismatch');
      if (canonical.metadata?.user_id && canonical.metadata.user_id!==row.user_id) flags.push('owner_mismatch');
      if (canonical.current_period_end && Math.abs(canonical.current_period_end*1000-Date.parse(row.current_period_end))>1000) flags.push('period_mismatch');
    }
    if(flags.length) discrepancies.push({record:label(row.id),local_status:row.status,provider_status:canonical?.status??'unverified',flags});
  }
  return {observed_at:input.observed_at,mode:'report_only',provider_scope:input.provider_scope??{account:'unspecified',mode:'unspecified'},database_rows:input.database_subscriptions.length,
    provider_rows:input.stripe_subscriptions.length,provider_export_complete:input.stripe_export_complete===true,
    discrepancies,unmapped_provider_subscriptions:input.stripe_subscriptions.filter(s=>!seen.has(s.id)).length,
    scope_caveat:'A complete export only covers the selected Stripe account and mode. An absent ID is unverified, not proof of cancellation; historical test-mode or other-account IDs may be present in the database.',
    instruction:'Review individual canonical subscriptions, invoices and ownership before changing records. Do not derive MRR from local status labels. No balance or status changes have been made.'};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  if(process.argv.length!==3) throw new Error('Usage: node scripts/reconcile-billing-readonly.mjs snapshot.json');
  console.log(JSON.stringify(reconcileBilling(JSON.parse(readFileSync(process.argv[2],'utf8'))),null,2));
}
