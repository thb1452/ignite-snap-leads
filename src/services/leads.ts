import { supabase } from '@/integrations/supabase/client';
import { csvCell, type Outcome } from './crmModel';
import { receiptCaseService, privateActivities, type ReceiptRpc } from './receiptCases';
import type { ReceiptCaseDetail } from './receiptCaseContract';

export interface PipelineStage { id:string; org_id:string; name:string; sort_order:number; color:string; is_won:boolean; is_lost:boolean; is_default:boolean; created_at:string }
export interface Lead {
  id:string; org_id:string; property_id:string | null; owner_id:string | null; stage_id:string;
  assigned_to:string | null; created_by:string; priority:number; source:string; notes:string | null;
  title:string | null; contact_restricted:boolean; next_action:string | null; last_contacted_at:string | null; next_follow_up_at:string | null;
  estimated_value:number | null; estimated_repairs:number | null; offer_amount:number | null; contract_deadline:string | null;
  archived_at:string | null; created_at:string; updated_at:string;
}
export interface LeadActivity { id:string; lead_id:string; org_id:string; actor_id:string | null; activity_type:string; payload:Record<string,unknown>; created_at:string }
export interface CrmContact { id:string; lead_id:string; org_id:string; name:string; relationship:'owner'|'buyer'|'agent'|'other'; phone:string|null; email:string|null; source:string; do_not_contact:boolean; restriction_note:string|null; created_at:string; updated_at:string }
export type ContactInput = Pick<CrmContact,'id'|'name'|'relationship'|'phone'|'email'|'source'|'do_not_contact'|'restriction_note'>;
export type LeadEdits = Pick<Lead,'title'|'next_action'|'next_follow_up_at'|'estimated_value'|'estimated_repairs'|'offer_amount'|'contract_deadline'|'priority'>;
export interface PropertySnapshot {id:string; address:string|null; city:string|null; state:string|null; zip:string|null}
export interface SourceDetail { address:string; city:string; state:string; scope:string; events:Array<{record_key:string; case_opened_date:string|null; violation_date:string|null; status_as_collected:string|null; collected_at:string|null; case_opened_date_meaning:string; source_original_text:string}> }
// New RPCs/tables are declared here until generated types are refreshed from the
// reviewed staging schema. This never selects a service-role client.
const db = supabase as unknown as import('@supabase/supabase-js').SupabaseClient;
export async function assertCrmIdentity(actor:string) {
  const {data,error} = await supabase.auth.getUser();
  if (!actor || error || data.user?.id !== actor) throw new Error('Your account changed. Reopen this screen before continuing.');
}
async function checked<T>(actor:string, request:()=>PromiseLike<{data:T;error:unknown}>):Promise<T> {
  await assertCrmIdentity(actor);
  const {data,error} = await request();
  if (error) throw error;
  await assertCrmIdentity(actor); // Discard a reply from an earlier account.
  return data;
}
async function orgId(actor:string) {
  const row = await checked(actor,()=>supabase.from('profiles').select('org_id').eq('user_id',actor).single());
  if (!row?.org_id) throw new Error('Private workspace unavailable.');
  return row.org_id;
}
export async function fetchPipelineStages(actor:string):Promise<PipelineStage[]> {
  const org = await orgId(actor);
  return (await checked(actor,()=>db.from('pipeline_stages').select('*').eq('org_id',org).order('sort_order'))) ?? [];
}
async function allRows<T>(actor:string,table:string,filter:(q:ReturnType<ReturnType<typeof db.from>['select']>)=>ReturnType<ReturnType<typeof db.from>['select']>):Promise<T[]> {
  const rows:T[]=[];
  for(let offset=0;;offset+=500) {
    const page = await checked(actor,()=>filter(db.from(table).select('*')).order('id').range(offset,offset+499)) as T[];
    rows.push(...(page??[]));
    if (!page || page.length<500) return rows;
    if(rows.length>=20000) throw new Error('This workspace needs a larger archive export. Contact support; no partial export was created.');
  }
}
export async function fetchLeads(actor:string):Promise<Lead[]> {
  return (await allRows<Lead>(actor,'leads',q=>q)).sort((a,b)=>b.updated_at.localeCompare(a.updated_at));
}
export async function fetchLeadById(actor:string,id:string):Promise<Lead|null> {
  return checked(actor,()=>db.from('leads').select('*').eq('id',id).maybeSingle());
}
export async function fetchLeadActivities(actor:string,id:string):Promise<LeadActivity[]> {
  // Source annotations have a different authorization lifetime from private work.
  // Their facts belong exclusively in the revalidated evidence panel, never in
  // this longer-lived private activity cache or an offline fallback.
  return privateActivities(await allRows<LeadActivity>(actor,'lead_activities',q=>q.eq('lead_id',id)))
    .sort((a,b)=>b.created_at.localeCompare(a.created_at));
}
export async function createLeadFromProperty(actor:string,propertyId:string):Promise<Lead> {
  const lead = await checked<Lead>(actor,()=>db.rpc('fn_crm_add_property_v1',{p_property_id:propertyId}));
  if(!lead?.id) throw new Error('The lead could not be confirmed. Refresh before trying again.');
  return lead;
}
export async function updateLeadStage(actor:string,id:string,stageId:string):Promise<Lead> {
  return checked(actor,()=>db.from('leads').update({stage_id:stageId}).eq('id',id).select('*').single());
}
export async function updateLead(actor:string,id:string,expected:string,updates:LeadEdits):Promise<Lead> {
  // Explicit allowlist: a UI payload cannot reassign ownership or property identity.
  const {title,next_action,next_follow_up_at,estimated_value,estimated_repairs,offer_amount,contract_deadline,priority}=updates;
  const {data,error}=await checked(actor,async()=>{
    const result=await db.from('leads').update({title,next_action,next_follow_up_at,estimated_value,estimated_repairs,offer_amount,contract_deadline,priority}).eq('id',id).eq('updated_at',expected).select('*').maybeSingle();
    return {data:result,error:null};
  });
  if(error) throw error;
  if(!data) throw new Error('This lead changed or is unavailable. Refresh before saving.');
  return data;
}
export async function archiveLead(actor:string,id:string,restore=false):Promise<Lead> {
  return checked(actor,()=>db.from('leads').update({archived_at:restore?null:new Date().toISOString()}).eq('id',id).select('*').single());
}
export async function addLeadNote(actor:string,id:string,note:string) {
  if(!note.trim() || note.length>4000) throw new Error('Enter a note up to 4,000 characters.');
  const lead=await fetchLeadById(actor,id);
  if(!lead) throw new Error('Lead unavailable.');
  return checked(actor,()=>db.from('lead_activities').insert({lead_id:id,org_id:lead.org_id,actor_id:actor,activity_type:'note',payload:{note:note.trim()}}).select('id').single());
}
export async function recordOutcome(actor:string,args:{leadId:string;requestId:string;expected:string;outcome:Outcome;note:string;nextAction:string|null;dueAt:string|null;completeAction:boolean}):Promise<Lead> {
  return checked(actor,()=>db.rpc('fn_crm_record_outcome_v1',{p_lead_id:args.leadId,p_request_id:args.requestId,p_expected_updated_at:args.expected,p_outcome:args.outcome,p_note:args.note,p_next_action:args.nextAction,p_due_at:args.dueAt,p_complete_action:args.completeAction}));
}
export async function fetchContacts(actor:string,id:string):Promise<CrmContact[]> {
  return allRows<CrmContact>(actor,'crm_contacts',q=>q.eq('lead_id',id));
}
export async function saveContact(actor:string,lead:Lead,input:ContactInput):Promise<CrmContact> {
  return checked(actor,()=>db.from('crm_contacts').upsert({...input,lead_id:lead.id,org_id:lead.org_id},{onConflict:'id'}).select('*').single());
}
export async function fetchPropertySnapshot(actor:string,id:string):Promise<PropertySnapshot|null> {
  return checked(actor,()=>db.from('properties').select('id,address,city,state,zip').eq('id',id).maybeSingle());
}
export async function fetchSourceDetail(actor:string,leadId:string):Promise<SourceDetail[]> {
  return checked(actor,()=>db.rpc('fn_get_source_crm_detail_v1',{p_lead_id:leadId}));
}
export async function exportPrivateCrm(actor:string) {
  const leads=await fetchLeads(actor);
  const fields=['id','title','stage_id','source','next_action','next_follow_up_at','last_contacted_at','estimated_value','estimated_repairs','offer_amount','contract_deadline','archived_at'] as const;
  const csv=[fields.map(csvCell).join(','),...leads.map(lead=>fields.map(key=>csvCell(lead[key])).join(','))].join('\r\n');
  await assertCrmIdentity(actor);
  return csv;
}

export async function fetchCrmEvidence(actor:string,lead:Lead,signal=new AbortController().signal):Promise<{kind:'receipt';detail:ReceiptCaseDetail}|{kind:'source';rows:SourceDetail[]}|{kind:'property';property:PropertySnapshot|null}|{kind:'removed'}> {
  if(!lead.property_id)return {kind:'removed'};
  if(lead.source==='receipt_case_snapshot')return {kind:'receipt',detail:await receiptCaseService(db as unknown as ReceiptRpc,assertCrmIdentity).detail(actor,lead.id,lead.property_id,signal)};
  const source=await checked<boolean>(actor,()=>db.rpc('fn_is_source_property_v1',{p_property_id:lead.property_id}));
  if(source===true)return {kind:'source',rows:await fetchSourceDetail(actor,lead.id)};
  if(source!==false)throw new Error('Property access could not be verified.');
  return {kind:'property',property:await fetchPropertySnapshot(actor,lead.property_id)};
}

export async function hasOutcomeReceipt(actor:string,leadId:string,requestId:string):Promise<boolean> {
  const receipt=await checked<{id:string}|null>(actor,()=>db.from('lead_activities').select('id').eq('id',requestId).eq('lead_id',leadId).eq('actor_id',actor).eq('activity_type','task').maybeSingle());
  return receipt?.id===requestId;
}
