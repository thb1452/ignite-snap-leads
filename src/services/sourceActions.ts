import type { SourceReviewEvent } from './sourceReview';

export const HASH = /^[0-9a-f]{64}$/;
export const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type SourceActionRpc = {
  auth: { getUser: () => Promise<{data: {user: {id: string} | null} | null; error: unknown}> };
  rpc: (name: string, args: Record<string, unknown>) => {
    abortSignal: (signal: AbortSignal) => PromiseLike<{data: any; error: {code?: string} | null}>;
  };
};
export class SourceActionAccessError extends Error {}
export class SourceActionRejectedError extends Error {}
// Each network stage has its own deadline; a complete bounded history may take
// longer. Abort races prevent late Auth responses from continuing into an RPC.
export async function boundedSourceRequest<T>(signal:AbortSignal,run:(requestSignal:AbortSignal)=>PromiseLike<T>):Promise<T> {
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  let interrupted:()=>void=()=>{};
  try{return await new Promise<T>((resolve,reject)=>{
    interrupted=()=>{controller.abort();reject(new Error('The action check was interrupted. Any saved decision remains available for reconciliation.'));};
    signal.addEventListener('abort',interrupted,{once:true});
    if(signal.aborted){interrupted();return;}
    timer=setTimeout(()=>{controller.abort();reject(new Error('This request timed out. Refresh or reconcile the same saved decision before continuing.'));},15000);
    Promise.resolve().then(()=>{if(controller.signal.aborted)throw new Error('The action check was interrupted.');return run(controller.signal);})
      .then(value=>{if(controller.signal.aborted)throw new Error('The action check was interrupted.');resolve(value);},reject).catch(reject);
  });}finally{if(timer!==undefined)clearTimeout(timer);signal.removeEventListener('abort',interrupted);}
}
export async function sourceRpc(client: SourceActionRpc, actor: string, name: string, args: Record<string, unknown>, signal: AbortSignal) {
  if (!ID.test(actor)) throw new SourceActionAccessError('Sign in with the owner account assigned to this batch.');
  const auth = await boundedSourceRequest(signal,()=>client.auth.getUser());
  if (signal.aborted) throw new Error('The action check was interrupted.');
  if (auth.error || auth.data?.user?.id !== actor) throw new SourceActionAccessError('Your account changed or owner access could not be verified.');
  const result = await boundedSourceRequest(signal,requestSignal=>client.rpc(name, args).abortSignal(requestSignal));
  if (result.error?.code === '42501' || result.error?.code === 'PGRST301') throw new SourceActionAccessError('This account cannot perform that action on these records.');
  if (result.error?.code === '40001') throw new SourceActionRejectedError('The source history changed. Refresh to load every history page before continuing.');
  if (result.error?.code === '22023') throw new SourceActionRejectedError('The evidence or saved action no longer matches. Refresh and review the saved decision before continuing.');
  if (result.error?.code === 'P0001') throw new SourceActionRejectedError('The server rejected this action. Check the evidence and current account allowance before trying again.');
  if (result.error) throw new Error('The action could not be confirmed. Reconcile the saved attempt before trying another action.');
  return result.data;
}
export async function evidenceFileHash(file: Pick<File, 'size' | 'arrayBuffer'>): Promise<string> {
  if (!file || file.size < 1 || file.size > 20 * 1024 * 1024) throw new Error('Choose an evidence file up to 20 MB.');
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
}
export const reasonLabels: Record<string, string> = {
  confidentiality_not_provided: 'Confidentiality and permitted disclosure',
  unit_not_provided: 'Missing affected unit',
  current_building_and_unit_scope_unverified: 'Current building and unit conditions',
  current_private_original_proof_not_bound: 'Private original and backup evidence',
  customer_property_mapping_missing: 'Exact customer property mapping',
  customer_entitlement_not_connected: 'Current account allowance',
  customer_release_approval_missing: 'Explicit release decision for this account',
  distribution_review_pending: 'Distribution terms and attribution',
};
export type Resolution = {reason: string; disposition: 'verified' | 'retained_limitation' | 'deferred_to_request_authorization'; evidence_sha256: string; note: string};
export function allowedDispositions(reason: string): Resolution['disposition'][] {
  if (reason === 'customer_entitlement_not_connected') return ['verified', 'deferred_to_request_authorization'];
  if (['unit_not_provided', 'current_building_and_unit_scope_unverified'].includes(reason)) return ['verified', 'retained_limitation'];
  return ['verified'];
}
const validEvidence = (hash: unknown, note: unknown) => typeof hash === 'string' && HASH.test(hash) &&
  typeof note === 'string' && note.trim().length >= 10 && note.length <= 2000;
export function buildResolutions(events: SourceReviewEvent[], decisions: Record<string, Partial<Resolution>>, explicitApply: boolean): Record<string, Resolution[]> {
  if (!explicitApply || !events.length) throw new Error('Confirm that each reason was reviewed for every selected record.');
  return Object.fromEntries(events.map(e => [e.record_key, e.review_reasons.map(reason => {
    const d = decisions[reason];
    if (!d?.disposition || !allowedDispositions(reason).includes(d.disposition) || !validEvidence(d.evidence_sha256, d.note)) {
      throw new Error('Complete the evidence and decision for every review reason.');
    }
    return {reason, disposition: d.disposition, evidence_sha256: d.evidence_sha256!, note: d.note!};
  })]));
}
export type SourceCommand = {
  kind: 'review' | 'mapping' | 'acceptance' | 'revocation' | 'crm'; args: Record<string, any>;
};
const writes = {
  review: {rpc: 'fn_record_source_review_v1', id: 'p_command_id', result: 'review_id', fields: ['p_preparation','p_record_keys','p_expected_selection_sha256','p_outcome','p_evidence_sha256','p_note']},
  mapping: {rpc: 'fn_bind_source_property_v1', id: 'p_command_id', result: 'mapping_id', fields: ['p_preparation','p_source_property_id','p_source_evidence_sha256','p_mode','p_existing_property_id','p_expected_target_sha256','p_evidence_sha256','p_note']},
  acceptance: {rpc: 'fn_accept_source_selection_v1', id: 'p_command_id', result: 'acceptance_id', fields: ['p_review_id','p_consumer_user_id','p_purpose','p_mapping_ids','p_resolutions','p_evidence_sha256','p_valid_until']},
  revocation: {rpc: 'fn_revoke_source_decision_v1', id: 'p_command_id', result: 'revocation_id', fields: ['p_kind','p_target_id','p_evidence_sha256','p_note']},
  crm: {rpc: 'fn_handoff_source_to_crm_v1', id: 'p_request_id', result: 'source_link_id', fields: ['p_acceptance_id','p_source_property_id','p_stage_id']},
} as const;
function validIds(values: unknown, max: number, pattern = ID): boolean {
  return Array.isArray(values) && values.length > 0 && values.length <= max && values.every(v => typeof v === 'string' && pattern.test(v)) && new Set(values).size === values.length;
}
export function validateSourceCommand(command: SourceCommand, preparation: string): void {
  const definition = writes[command.kind], a = command.args;
  if (!HASH.test(preparation) || !definition || !a || typeof a !== 'object' || Array.isArray(a) ||
      Object.keys(a).sort().join('|') !== [...definition.fields].sort().join('|')) throw new Error('Unsupported source action.');
  if ('p_preparation' in a && a.p_preparation !== preparation) throw new Error('The action belongs to a different batch.');
  if (command.kind === 'review' && (!validIds(a.p_record_keys, 2000, HASH) || !HASH.test(a.p_expected_selection_sha256) ||
      !['reviewed','held','rejected'].includes(a.p_outcome) || !validEvidence(a.p_evidence_sha256,a.p_note))) throw new Error('Complete the selected review and its evidence.');
  if (command.kind === 'mapping' && (!ID.test(a.p_source_property_id) || !HASH.test(a.p_source_evidence_sha256) ||
      !validEvidence(a.p_evidence_sha256,a.p_note) ||
      !(a.p_mode === 'create_source_identity' && a.p_existing_property_id === null && a.p_expected_target_sha256 === null ||
        a.p_mode === 'reuse_existing' && ID.test(a.p_existing_property_id) && HASH.test(a.p_expected_target_sha256)))) throw new Error('Choose and verify an explicit property mapping.');
  if (command.kind === 'acceptance' && (!ID.test(a.p_review_id) || !ID.test(a.p_consumer_user_id) ||
      !['customer_export','crm'].includes(a.p_purpose) || !validIds(a.p_mapping_ids,1000) || !HASH.test(a.p_evidence_sha256) ||
      !Number.isFinite(Date.parse(a.p_valid_until)) || !a.p_resolutions || typeof a.p_resolutions !== 'object' || Array.isArray(a.p_resolutions))) throw new Error('Complete the account, purpose, expiry and record resolutions.');
  if (command.kind === 'acceptance' && (Object.keys(a.p_resolutions).length < 1 || Object.keys(a.p_resolutions).length > 2000 ||
      Object.entries(a.p_resolutions).some(([key,rows]:[string,any])=>!HASH.test(key)||!Array.isArray(rows)||!rows.length||
        rows.some((r:any)=>!r||typeof r.reason!=='string'||!allowedDispositions(r.reason).includes(r.disposition)||!validEvidence(r.evidence_sha256,r.note))||
        new Set(rows.map((r:any)=>r.reason)).size!==rows.length))) throw new Error('Complete every selected record resolution.');
  if (command.kind === 'revocation' && (!['mapping','acceptance'].includes(a.p_kind) || !ID.test(a.p_target_id) ||
      !validEvidence(a.p_evidence_sha256,a.p_note))) throw new Error('Complete the decision to revoke and its evidence.');
  if (command.kind === 'crm' && ![a.p_acceptance_id,a.p_source_property_id,a.p_stage_id].every(v => typeof v === 'string' && ID.test(v))) throw new Error('Choose an approved source property and CRM stage.');
}
function canonical(value: any): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
type Pending = {version: 'source-action-attempt-v1'; actor: string; preparation: string; commandId: string; command: SourceCommand};
export const pendingKey = (actor: string, preparation: string) => `snap-source-action-v1:${actor}:${preparation}`;
export function readPending(storage: Pick<Storage,'getItem'>, actor: string, preparation: string): Pending | null {
  const raw = storage.getItem(pendingKey(actor,preparation)); if (raw === null) return null;
  let p: Pending; try { p = JSON.parse(raw); } catch { throw new Error('Saved source action is unreadable. Review it before continuing.'); }
  if (p.version !== 'source-action-attempt-v1' || p.actor !== actor || p.preparation !== preparation || !ID.test(p.commandId)) throw new Error('Saved source action does not match this account.');
  validateSourceCommand(p.command, preparation); return p;
}
export async function runSourceCommand(client: SourceActionRpc, actor: string, preparation: string, command: SourceCommand,
  storage: Pick<Storage,'getItem'|'setItem'|'removeItem'>, locks: Pick<LockManager,'request'>, signal: AbortSignal) {
  validateSourceCommand(command,preparation);
  if (!ID.test(actor) || !locks?.request) throw new Error('A signed-in account and safe browser locking are required.');
  return locks.request(pendingKey(actor,preparation), async () => {
    let pending = readPending(storage,actor,preparation);
    const createdNow = pending === null;
    if (pending && canonical(pending.command) !== canonical(command)) throw new Error('Reconcile the saved source action before preparing another action.');
    if (!pending) {
      pending = {version:'source-action-attempt-v1',actor,preparation,commandId:crypto.randomUUID(),command};
      storage.setItem(pendingKey(actor,preparation),JSON.stringify(pending));
    }
    const spec = writes[command.kind];
    let result;
    try { result = await sourceRpc(client,actor,spec.rpc,{...command.args,[spec.id]:pending.commandId},signal); }
    catch (error) {
      // A fresh statement rejected by authentication/PostgreSQL cannot have
      // committed. An older uncertain attempt must still remain reconcilable:
      // today's denial does not establish yesterday's transaction outcome.
      if (createdNow && (error instanceof SourceActionAccessError || error instanceof SourceActionRejectedError) &&
          readPending(storage,actor,preparation)?.commandId === pending.commandId) storage.removeItem(pendingKey(actor,preparation));
      throw error;
    }
    if (!result || typeof result !== 'object' || !ID.test(result[spec.result]) || typeof result.replayed !== 'boolean' ||
        (command.kind !== 'crm' && result[spec.result] !== pending.commandId) ||
        (command.kind === 'crm' && (!ID.test(result.lead_id)||!ID.test(result.activity_id)))) throw new Error('Source action receipt is unconfirmed. Reconcile the saved attempt.');
    return {result,commandId:pending.commandId};
  });
}
export function confirmSourceActionReadback(command:SourceCommand,result:Record<string,any>,state:Record<string,any>):void {
  const collection={review:'reviews',mapping:'mappings',acceptance:'acceptances',revocation:'revocations',crm:'crm_links'}[command.kind];
  const id=result[writes[command.kind].result],row=state[collection]?.find((r:any)=>r.id===id),a=command.args;
  if(!row||command.kind==='review'&&row.outcome!==a.p_outcome||
    command.kind==='mapping'&&row.source_property_id!==a.p_source_property_id||
    command.kind==='acceptance'&&(row.consumer_user_id!==a.p_consumer_user_id||row.purpose!==a.p_purpose||row.review_event_id!==a.p_review_id)||
    command.kind==='revocation'&&(row.kind!==a.p_kind||row.target_id!==a.p_target_id)||
    command.kind==='crm'&&(row.lead_id!==result.lead_id||row.acceptance_id!==a.p_acceptance_id||row.source_property_id!==a.p_source_property_id)) {
    throw new Error('The action receipt is not yet matched to server history. Reconcile the saved attempt.');
  }
}
export async function acknowledgeSourceCommand(storage: Pick<Storage,'getItem'|'removeItem'>, locks: Pick<LockManager,'request'>,
  actor: string, preparation: string, commandId: string) {
  await locks.request(pendingKey(actor,preparation), () => {
    if (readPending(storage,actor,preparation)?.commandId === commandId) storage.removeItem(pendingKey(actor,preparation));
  });
}
