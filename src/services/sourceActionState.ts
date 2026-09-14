import { HASH, ID, sourceRpc, type SourceActionRpc } from './sourceActions.ts';

export type SourceReviewDecision = {id:string;record_keys:string[];selection_sha256:string;outcome:'reviewed'|'held'|'rejected';current:boolean;note:string;evidence_sha256:string;created_at:string;reviewer_user_id:string};
export type SourceMapping = {id:string;source_property_id:string;customer_property_id:string;source_evidence_sha256:string;target_snapshot_sha256:string;source_address:string;target_address:string;current:boolean;revoked:boolean;created_for_source:boolean;created_at:string};
export type SourceAcceptance = {id:string;review_event_id:string;actor_user_id:string;consumer_user_id:string;consumer_org_id:string;consumer_label:string;purpose:'customer_export'|'crm';record_keys:string[];mapping_ids:string[];valid_until:string;current:boolean;unavailable_reason:string|null;created_at:string};
export type SourceActionState = {version:string;preparation_sha256:string;actor_user_id:string;checked_at:string;can_administer:true;complete:boolean;counts:Record<string,number>;
  reviews:SourceReviewDecision[];mappings:SourceMapping[];acceptances:SourceAcceptance[];revocations:Array<{id:string;kind:string;target_id:string;note:string;created_at:string}>;
  crm_links:Array<{id:string;lead_id:string;acceptance_id:string;source_property_id:string;consumer_user_id:string;created_at:string}>};
export type SourceTarget = {property_id:string;address:string;city:string;state:string;zip:string;enforcement_type:string|null;target_sha256:string;source_created:boolean;already_mapped:boolean;supported_scope:boolean};
export type SourceConsumer = {user_id:string;org_id:string;label:string;email:string|null;active_account:boolean;customer_access_held:boolean;
  subscription:{mode:string;status:string|null;current:boolean};stages:Array<{id:string;name:string;sort_order:number;color:string|null;is_won:boolean;is_lost:boolean;is_default:boolean}>};
export type SourcePreview = {version:'source-action-preview-v1';preparation_sha256:string;selection_sha256:string;customer_accepted:false;
  items:Array<{record_key:string;source_row:number;source_property_id:string;source_parcel_reference:string;parcel_evidence_sha256:string;original_sha256:string;canonical_sha256:string}>};
const obj=(v:any)=>v&&typeof v==='object'&&!Array.isArray(v);
const uuid=(v:any)=>typeof v==='string'&&ID.test(v);
const digest=(v:any)=>typeof v==='string'&&HASH.test(v);
const unique=(a:any[],field='id')=>new Set(a.map(v=>v[field])).size===a.length;
export function parseSourceActionState(value:any,actor:string,preparation:string):SourceActionState {
  const keys=['reviews','mappings','acceptances','revocations','crm_links'];
  if (!obj(value)||value.actor_user_id!==actor||value.preparation_sha256!==preparation||value.can_administer!==true||
      value.version!=='owner-source-action-state-v1'||typeof value.checked_at!=='string'||typeof value.complete!=='boolean'||!obj(value.counts)||
      keys.some(k=>!Array.isArray(value[k])||!unique(value[k])||value[k].some((v:any)=>!obj(v)||!uuid(v.id))||
        !Number.isInteger(value.counts[k])||value.counts[k]<value[k].length)||
      value.complete!==keys.every(k=>value.counts[k]===value[k].length)) throw new Error('Owner action history is incomplete or belongs to another account.');
  for(const r of value.reviews)if(!digest(r.selection_sha256)||!Array.isArray(r.record_keys)||!r.record_keys.every(digest)||typeof r.current!=='boolean'||!['reviewed','held','rejected'].includes(r.outcome))throw new Error('Source review history could not be checked.');
  for(const m of value.mappings)if(!uuid(m.source_property_id)||!uuid(m.customer_property_id)||!digest(m.source_evidence_sha256)||!digest(m.target_snapshot_sha256)||typeof m.current!=='boolean'||typeof m.revoked!=='boolean')throw new Error('Property mappings could not be checked.');
  for(const a of value.acceptances)if(!uuid(a.review_event_id)||!uuid(a.consumer_user_id)||!uuid(a.consumer_org_id)||!Array.isArray(a.mapping_ids)||!a.mapping_ids.every(uuid)||!Array.isArray(a.record_keys)||!a.record_keys.every(digest)||typeof a.current!=='boolean'||!['customer_export','crm'].includes(a.purpose))throw new Error('Consumer decisions could not be checked.');
  return value;
}
export async function loadSourceActionState(client:SourceActionRpc,actor:string,preparation:string,signal:AbortSignal) {
  if(!HASH.test(preparation))throw new Error('Choose an assigned source batch.');
  return parseSourceActionState(await sourceRpc(client,actor,'fn_owner_source_action_state_v1',{p_preparation:preparation},signal),actor,preparation);
}
export async function previewSourceSelection(client:SourceActionRpc,actor:string,preparation:string,keys:string[],signal:AbortSignal):Promise<SourcePreview> {
  if(!keys.length||keys.length>2000||!keys.every(digest)||new Set(keys).size!==keys.length)throw new Error('Select the exact source records to review.');
  const d=await sourceRpc(client,actor,'fn_preview_source_review_v1',{p_preparation:preparation,p_record_keys:keys},signal);
  if(!obj(d)||d.version!=='source-action-preview-v1'||d.preparation_sha256!==preparation||d.customer_accepted!==false||!digest(d.selection_sha256)||
    !Array.isArray(d.items)||d.items.length!==keys.length||!unique(d.items,'record_key')||d.items.some((i:any)=>!keys.includes(i.record_key)||!uuid(i.source_property_id)||!digest(i.parcel_evidence_sha256)||!digest(i.original_sha256)||!digest(i.canonical_sha256)))throw new Error('Selected evidence changed or could not be checked.');
  return d;
}
export async function previewSourceTarget(client:SourceActionRpc,actor:string,preparation:string,propertyId:string,signal:AbortSignal):Promise<SourceTarget> {
  if(!uuid(propertyId))throw new Error('Enter the exact existing customer property reference.');
  const d=await sourceRpc(client,actor,'fn_preview_source_target_v1',{p_preparation:preparation,p_property_id:propertyId},signal);
  if(!obj(d)||d.version!=='owner-source-target-preview-v1'||d.preparation_sha256!==preparation||d.property_id!==propertyId||!digest(d.target_sha256)||typeof d.supported_scope!=='boolean')throw new Error('Existing property could not be verified.');
  return d;
}
export async function lookupSourceConsumer(client:SourceActionRpc,actor:string,preparation:string,userId:string,signal:AbortSignal):Promise<SourceConsumer> {
  if(!uuid(userId))throw new Error('Enter the exact existing account reference.');
  const d=await sourceRpc(client,actor,'fn_lookup_source_consumer_v1',{p_preparation:preparation,p_user_id:userId},signal);
  if(!obj(d)||d.version!=='owner-source-consumer-preview-v1'||d.preparation_sha256!==preparation||d.user_id!==userId||!uuid(d.org_id)||d.active_account!==true||typeof d.customer_access_held!=='boolean'||
    !obj(d.subscription)||typeof d.subscription.current!=='boolean'||!Array.isArray(d.stages)||!unique(d.stages)||d.stages.some((s:any)=>!uuid(s.id)||typeof s.name!=='string'))throw new Error('The exact account and CRM stages could not be verified.');
  return d;
}
export async function loadSourceAcceptanceDetail(client:SourceActionRpc,actor:string,preparation:string,acceptanceId:string,signal:AbortSignal) {
  if(!uuid(acceptanceId))throw new Error('Choose a saved consumer decision.');
  const d=await sourceRpc(client,actor,'fn_owner_source_acceptance_detail_v1',{p_preparation:preparation,p_acceptance_id:acceptanceId},signal);
  if(!obj(d)||d.version!=='owner-source-acceptance-detail-v1'||d.preparation_sha256!==preparation||d.acceptance_id!==acceptanceId||
    !uuid(d.review_event_id)||!uuid(d.consumer_user_id)||!uuid(d.consumer_org_id)||!obj(d.resolutions)||!Array.isArray(d.record_keys)||
    !d.record_keys.every(digest)||Object.keys(d.resolutions).length!==d.record_keys.length||
    d.record_keys.some((k:string)=>!Array.isArray(d.resolutions[k])||d.resolutions[k].some((r:any)=>!obj(r)||typeof r.reason!=='string'||
      typeof r.disposition!=='string'||typeof r.note!=='string'||!digest(r.evidence_sha256))))throw new Error('The saved evidence could not be checked.');return d;
}
