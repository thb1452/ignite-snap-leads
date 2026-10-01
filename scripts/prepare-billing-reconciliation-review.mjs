#!/usr/bin/env node
/** Produce a review plan and read-only preflight from an explicit private snapshot.
 * This utility has no network, SQL execution, delete, cancel, charge or apply mode.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const hash = value => createHash('sha256').update(value).digest('hex');
export function prepareReview(snapshot) {
  if (!Array.isArray(snapshot.classified) || !Array.isArray(snapshot.canonical_subscriptions)) throw new Error('Invalid evidence snapshot');
  if (!Number.isFinite(Date.parse(snapshot.observed_at))) throw new Error('Invalid observation timestamp');
  const identities = new Set();
  const rows=snapshot.classified.map(row=>{
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(row.id) || identities.has(row.id)) throw new Error('Invalid or duplicate row identity');
    identities.add(row.id);
    let action='retain_and_review'; let proposedStatus=row.status;
    if(row.class==='historical_test') {
      if(!row.evidence?.length || row.evidence.some(e=>e.livemode!==false || (e.object_id!==row.stripe_subscription_id && e.subscription_id!==row.stripe_subscription_id))) throw new Error('Test classification lacks exclusive exact-event evidence');
      const expired=Number.isFinite(Date.parse(row.current_period_end)) && Date.parse(row.current_period_end)<=Date.parse(snapshot.observed_at);
      action=['active','trialing'].includes(row.status)?(expired?'archive_expired_test_application_label':'review_current_test_entitlement'):'retain_test_history';
      if(action.startsWith('archive')) proposedStatus='cancelled';
    } else if(row.class==='matched_live') action='retain_cancelled_live_history_and_provider_dates';
    else if(row.class==='unverified_identity') action='quarantine_identity_do_not_change_provider_status';
    else if(row.class==='no_provider_identity') action=row.status==='active'?'review_expired_internal_starter_assignment':'retain_expired_internal_trial_history';
    return {id:row.id,user_id:row.user_id,stripe_subscription_id:row.stripe_subscription_id,classification:row.class,
      action,proposed_application_status:proposedStatus,expected_status:row.status,expected_updated_at:row.updated_at,
      expected_current_period_end:row.current_period_end,evidence_event_ids:(row.evidence??[]).map(e=>e.event_id),
      constraints:['Preserve complete before-image and evidence in a private audit record before any approved change.','Do not cancel or update any Stripe object.','Do not alter credits, usage counters, plans, prices or paid dates.']};
  });
  return {state:'CANDIDATE_REQUIRES_ROOT_REVIEW_NOT_APPLIED',observed_at:snapshot.observed_at,provider_scope:snapshot.provider_scope,rows,
    classification_counts:rows.reduce((a,r)=>(a[r.classification]=(a[r.classification]??0)+1,a),{}),
    application_label_changes:rows.filter(r=>r.proposed_application_status!==r.expected_status).length,
    unresolved:rows.filter(r=>r.classification==='unverified_identity').length,
    prerequisite:'Install reviewed billing provenance fields/private audit storage and provider-mode guards; verify preservation and rollback before any production update. No unverified identity may be treated as paid.'};
}
export function preflightSql(plan) {
  const records=plan.rows.map(r=>({id:r.id,status:r.expected_status,updated_at:r.expected_updated_at,period_end:r.expected_current_period_end,provider_id:r.stripe_subscription_id,classification:r.classification,action:r.action}));
  const json=JSON.stringify(records);
  if(json.includes('$snap_review$')) throw new Error('Invalid evidence delimiter');
  return `-- READ-ONLY preflight. This file cannot apply the proposal.\nBEGIN READ ONLY;\nWITH expected AS (SELECT * FROM jsonb_to_recordset($snap_review$${json}$snap_review$::jsonb) AS x(id uuid,status text,updated_at timestamptz,period_end timestamptz,provider_id text,classification text,action text))\nSELECT e.id,e.classification,e.action,\n (s.id IS NOT NULL AND s.status IS NOT DISTINCT FROM e.status AND s.updated_at IS NOT DISTINCT FROM e.updated_at AND s.current_period_end IS NOT DISTINCT FROM e.period_end AND s.stripe_subscription_id IS NOT DISTINCT FROM e.provider_id) AS unchanged_since_review,\n (s.current_period_end IS NOT NULL AND s.current_period_end<=now()) AS expired_application_period\nFROM expected e LEFT JOIN public.user_subscriptions s ON s.id=e.id ORDER BY e.classification,e.id;\nROLLBACK;\n`;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
 if(process.argv.length!==4) throw new Error('Usage: node scripts/prepare-billing-reconciliation-review.mjs private-snapshot.json private-output-directory');
 const input=readFileSync(process.argv[2],'utf8'),plan=prepareReview(JSON.parse(input));plan.source_snapshot_sha256=hash(input);
 const out=resolve(process.argv[3]);if(out===process.cwd() || out.startsWith(process.cwd()+'/')) throw new Error('Private output must be outside the git repository');
 mkdirSync(out,{recursive:true});writeFileSync(resolve(out,'billing-reconciliation-private-review.json'),JSON.stringify(plan,null,2)+'\n',{mode:0o600});writeFileSync(resolve(out,'billing-reconciliation-preflight.sql'),preflightSql(plan),{mode:0o600});
 console.log(JSON.stringify({state:plan.state,records:plan.rows.length,proposed_application_label_changes:plan.application_label_changes,unresolved:plan.unresolved,source_snapshot_sha256:plan.source_snapshot_sha256}));
}
