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
export const SOURCE_STATE_KINDS=['reviews','mappings','acceptances','revocations','crm_links'] as const;
type StateKind=typeof SOURCE_STATE_KINDS[number];
const MAX_STATE_ROWS=20000,MAX_STATE_BYTES=64*1024*1024,MAX_PAGE_BYTES=1048576;
type StateCursor={created_at:string;id:string}|null;
function sameCounts(a:Record<string,number>,b:Record<string,number>){return SOURCE_STATE_KINDS.every(k=>a[k]===b[k]);}
export function parseSourceStatePage(value:any,actor:string,preparation:string,kind:StateKind,revision:string|null){
  if(!obj(value)||value.version!=='owner-source-action-page-v1'||value.actor_user_id!==actor||value.preparation_sha256!==preparation||value.can_administer!==true||value.kind!==kind||!digest(value.revision)||revision!==null&&revision!==value.revision||!obj(value.counts)||
   SOURCE_STATE_KINDS.some(k=>!Number.isSafeInteger(value.counts[k])||value.counts[k]<0)||Object.keys(value.counts).length!==SOURCE_STATE_KINDS.length||typeof value.checked_at!=='string'||!Number.isFinite(Date.parse(value.checked_at))||
   !Array.isArray(value.rows)||value.rows.length>100||value.rows.some((r:any)=>!obj(r)||!uuid(r.id)||typeof r.created_at!=='string'||!Number.isFinite(Date.parse(r.created_at)))||!unique(value.rows))throw new Error('Source history page could not be verified. Refresh to load the complete history.');
  const last=value.rows[value.rows.length-1],next=value.next_cursor;
  if(next!==null&&(!last||!obj(next)||Object.keys(next).sort().join(',')!=='created_at,id'||next.id!==last.id||next.created_at!==last.created_at))throw new Error('Source history cursor could not be verified.');
  if(SOURCE_STATE_KINDS.reduce((n,k)=>n+value.counts[k],0)>MAX_STATE_ROWS||new TextEncoder().encode(JSON.stringify(value)).length>MAX_PAGE_BYTES)throw new Error('Source history exceeds the supported review size. No partial history was loaded.');
  return value;
}
export async function loadSourceActionState(client:SourceActionRpc,actor:string,preparation:string,signal:AbortSignal):Promise<SourceActionState> {
  if(!HASH.test(preparation))throw new Error('Choose an assigned source batch.');
  const controller=new AbortController(),abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
  let totalBytes=0;
  const page=async(kind:StateKind,after:StateCursor,revision:string|null)=>parseSourceStatePage(await sourceRpc(client,actor,'fn_owner_source_action_page_v1',{
    p_preparation:preparation,p_kind:kind,p_after:after,p_revision:revision,p_limit:100,
  },controller.signal),actor,preparation,kind,revision);
  try{
    const first=await page('reviews',null,null),all:Record<StateKind,any[]>={reviews:[],mappings:[],acceptances:[],revocations:[],crm_links:[]};
    const revision=first.revision,counts=first.counts;
    await Promise.all(SOURCE_STATE_KINDS.map(async kind=>{
      let cursor:StateCursor=null,initial=true;const seen=new Set<string>(),cursors=new Set<string>();
      for(;;){
        const part=kind==='reviews'&&initial?first:await page(kind,cursor,revision);initial=false;
        if(!sameCounts(part.counts,counts))throw new Error('Source history changed while loading. Refresh before continuing.');
        totalBytes+=new TextEncoder().encode(JSON.stringify(part)).length;
        if(totalBytes>MAX_STATE_BYTES)throw new Error('Source history exceeds the supported review size. No partial history was loaded.');
        for(const row of part.rows){if(seen.has(row.id))throw new Error('Source history repeated a row. Refresh before continuing.');seen.add(row.id);all[kind].push(row);}
        if(all[kind].length>counts[kind])throw new Error('Source history counts changed while loading.');
        cursor=part.next_cursor;
        if(cursor===null){if(all[kind].length!==counts[kind])throw new Error('Source history is missing rows. No partial history was loaded.');break;}
        const token=JSON.stringify(cursor);if(cursors.has(token)||part.rows.length===0)throw new Error('Source history did not advance.');cursors.add(token);
      }
    }));
    // Recheck the same history revision and current owner authorization once all
    // categories finish. Current flags remain per-page observations; writes and
    // exports independently recheck current roles, expiry and source evidence.
    await page('reviews',null,revision);
    return parseSourceActionState({version:'owner-source-action-state-v1',preparation_sha256:preparation,actor_user_id:actor,checked_at:first.checked_at,
      can_administer:true,complete:true,counts,...all},actor,preparation);
  }catch(error){controller.abort();throw error;}finally{signal.removeEventListener('abort',abort);}
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
