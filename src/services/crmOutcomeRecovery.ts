import { OUTCOMES, type Outcome } from './crmModel.ts';

export const CRM_OUTCOME_STORAGE_KEY = 'snap_crm_outcome_attempt_v1';
export const CRM_OUTCOME_TTL_MS = 24 * 60 * 60 * 1000;
// Only this RPC's explicit business conflict proves this request was rejected
// after its idempotent receipt lookup. Serialization/network failures remain
// uncertain and must preserve the exact saved command for reconciliation.
export function isOutcomeVersionConflict(error:unknown):boolean {
 return !!error&&typeof error==='object'&&'code' in error&&error.code==='PT409'
  &&'message' in error&&error.message==='Lead changed. Refresh before recording this outcome.';
}
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type OutcomeCommand = {leadId:string;requestId:string;expected:string;outcome:Outcome;note:string;nextAction:string|null;dueAt:string|null;completeAction:boolean};
type StorageLike = Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Envelope = {version:1;actor:string;leadId:string;createdAt:number;command:OutcomeCommand};
type Tombstone = {version:1;actor:string;leadId:string;createdAt:number;expired:true;requestId:string};
export type OutcomeRecovery =
 | {status:'none'}
 | {status:'pending';saved:Envelope}
 | {status:'expired';saved:Tombstone}
 | {status:'other_lead';leadId:string}
 | {status:'foreign'|'invalid'|'unavailable'};
function object(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
function date(value:unknown):value is string{return typeof value==='string'&&Number.isFinite(Date.parse(value));}
export function isOutcomeCommand(value:unknown):value is OutcomeCommand {
 if(!object(value)||Object.keys(value).sort().join('|')!==['leadId','requestId','expected','outcome','note','nextAction','dueAt','completeAction'].sort().join('|'))return false;
 return typeof value.leadId==='string'&&ID.test(value.leadId)&&typeof value.requestId==='string'&&ID.test(value.requestId)
  &&date(value.expected)&&typeof value.outcome==='string'&&(OUTCOMES as readonly string[]).includes(value.outcome)
  &&typeof value.note==='string'&&value.note.length<=4000&&typeof value.completeAction==='boolean'
  &&(value.nextAction===null&&value.dueAt===null||typeof value.nextAction==='string'&&value.nextAction.trim().length>0&&value.nextAction.length<=500&&date(value.dueAt));
}
export function readOutcomeRecovery(storage:StorageLike,actor:string,leadId:string,now=Date.now()):OutcomeRecovery {
 try {
  if(!ID.test(actor)||!ID.test(leadId))return {status:'unavailable'};
  const raw=storage.getItem(CRM_OUTCOME_STORAGE_KEY);if(!raw)return {status:'none'};
  const saved:unknown=JSON.parse(raw);
  if(!object(saved)||saved.version!==1||typeof saved.actor!=='string'||!ID.test(saved.actor)||typeof saved.leadId!=='string'||!ID.test(saved.leadId)
    ||typeof saved.createdAt!=='number'||!Number.isFinite(saved.createdAt)||saved.createdAt>now+60000)return {status:'invalid'};
  // Do not expose a different account's lead ID or private note. The auth boundary
  // also clears this fixed key on every identity transition.
  if(saved.actor!==actor)return {status:'foreign'};
  const expired=saved.expired===true;
  const keys=expired?['version','actor','leadId','createdAt','expired','requestId']:['version','actor','leadId','createdAt','command'];
  if(Object.keys(saved).sort().join('|')!==keys.sort().join('|'))return {status:'invalid'};
  if(expired&&typeof saved.requestId!=='string'||expired&&!ID.test(saved.requestId as string))return {status:'invalid'};
  if(!expired&&(!isOutcomeCommand(saved.command)||saved.command.leadId!==saved.leadId))return {status:'invalid'};
  let validated=saved as unknown as Envelope|Tombstone;
  if(!expired&&now-saved.createdAt>CRM_OUTCOME_TTL_MS){
   const full=validated as Envelope;
   // Expiry removes private draft text but retains a receipt pointer. Expiry is
   // not proof that the original request failed, so it never enables a new send.
   validated={version:1,actor,leadId:full.leadId,createdAt:full.createdAt,expired:true,requestId:full.command.requestId};
   storage.setItem(CRM_OUTCOME_STORAGE_KEY,JSON.stringify(validated));
  }
  if(saved.leadId!==leadId)return {status:'other_lead',leadId:saved.leadId};
  return 'expired' in validated?{status:'expired',saved:validated}:{status:'pending',saved:validated};
 } catch {return {status:'invalid'};}
}
export function saveOutcomeAttempt(storage:StorageLike,actor:string,command:OutcomeCommand,now=Date.now()):Envelope {
 if(!ID.test(actor)||!isOutcomeCommand(command))throw new Error('This work entry could not be validated.');
 const prior=readOutcomeRecovery(storage,actor,command.leadId,now);
 if(prior.status==='pending'){
  if(JSON.stringify(prior.saved.command)!==JSON.stringify(command))throw new Error('Reconcile the saved outcome before recording another.');
  return prior.saved;
 }
 if(prior.status!=='none')throw new Error('Reconcile the saved outcome before recording another.');
 const saved:Envelope={version:1,actor,leadId:command.leadId,createdAt:now,command};
 try{storage.setItem(CRM_OUTCOME_STORAGE_KEY,JSON.stringify(saved));if(storage.getItem(CRM_OUTCOME_STORAGE_KEY)!==JSON.stringify(saved))throw new Error();}
 catch{throw new Error('Private recovery storage is unavailable. No outcome was submitted.');}
 return saved;
}
export function clearOutcomeAttempt(storage:StorageLike,actor:string,leadId:string,requestId:string) {
 // Completion callbacks from an earlier account can arrive after a new account
 // starts work. Inspect without any foreign-account cleanup side effect.
 try {
  const raw=storage.getItem(CRM_OUTCOME_STORAGE_KEY);if(!raw)return;
  const saved:unknown=JSON.parse(raw);
  if(!object(saved)||saved.version!==1||saved.actor!==actor||saved.leadId!==leadId)return;
  const id=saved.expired===true?saved.requestId:isOutcomeCommand(saved.command)?saved.command.requestId:null;
  if(id===requestId)storage.removeItem(CRM_OUTCOME_STORAGE_KEY);
 }catch{/* Unverified recovery state remains blocked for reconciliation. */}
}
