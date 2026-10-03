import { sourceRpc, boundedSourceRequest, ID, HASH, type SourceActionRpc } from './sourceActions';

export type SourceCrmEvent = {recordKey:string;caseId:string;description:string|null;status:string|null;collectedAt:string;
  caseOpened:string|null;violationDate:string|null;sourceUrl:string;termsUrl:string;attribution:string|null;sourceNotice:string|null;
  originalText:string;originalSha256:string;deliveryId:string;processingRunId:string;preparation:string};
export type SourceCrmGroup = {propertyId:string;sourcePropertyId:string;mappingId:string;acceptanceId:string;reviewId:string;
  address:string;city:string;state:string;zip:string;parcelOriginalText:string;parcelSha256:string;events:SourceCrmEvent[]};
const obj=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown):v is string=>typeof v==='string';
const nullable=(v:unknown):v is string|null=>v===null||text(v);
const id=(v:unknown):v is string=>text(v)&&ID.test(v);
const hash=(v:unknown):v is string=>text(v)&&HASH.test(v);
const url=(v:unknown):v is string=>{try{return text(v)&&new URL(v).protocol==='https:';}catch{return false;}};
async function digest(text:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export async function parseSourceCrmDetail(data:unknown,propertyId:string):Promise<SourceCrmGroup[]> {
  const fail=():never=>{throw new Error('The approved source details could not be verified.');};
  if(!id(propertyId)||!Array.isArray(data)||!data.length||data.length>1000||new TextEncoder().encode(JSON.stringify(data)).length>6291456)return fail();
  let count=0;const groups=new Set<string>(),result:SourceCrmGroup[]=[];
  for(const p of data){
    if(!obj(p)||p.property_id!==propertyId||!id(p.source_property_id)||!id(p.mapping_id)||!id(p.acceptance_id)||!id(p.review_event_id)||!hash(p.acceptance_revision)||
      p.enforcement_type!=='code_violation'||p.scope!=='dated_parcel_source_snapshot'||![p.address,p.city,p.state,p.zip,p.parcel_evidence_original_text].every(text)||!hash(p.parcel_evidence_sha256)||
      !Array.isArray(p.events)||!p.events.length||groups.has(p.acceptance_id+':'+p.mapping_id))return fail();
    groups.add(p.acceptance_id+':'+p.mapping_id);
    if(await digest(p.parcel_evidence_original_text)!==p.parcel_evidence_sha256)return fail();
    let parcel;try{parcel=JSON.parse(p.parcel_evidence_original_text);}catch{return fail();}
    if(!obj(parcel)||parcel.property_id!==p.source_property_id||parcel.source_scope!=='dated_parcel_snapshot'||!hash(parcel.preparation_sha256)||!text(parcel.source_parcel_reference))return fail();
    const events:SourceCrmEvent[]=[],seen=new Set<string>();
    for(const e of p.events){
      if(++count>1000||!obj(e)||!hash(e.record_key)||seen.has(e.record_key)||!Number.isInteger(e.source_row)||e.source_row<1||e.preparation_sha256!==parcel.preparation_sha256||
        !id(e.delivery_id)||!id(e.processing_run_id)||!hash(e.original_sha256)||!hash(e.canonical_sha256)||!text(e.source_original_text)||!obj(e.source_fields)||
        !nullable(e.status_as_collected)||!nullable(e.case_opened_date)||!nullable(e.violation_date)||e.violation_opened_date!==null||!text(e.collected_at))return fail();
      seen.add(e.record_key);const s=e.source_fields;
      if(s.record_key!==e.record_key||s.delivery_id!==e.delivery_id||s.processing_run_id!==e.processing_run_id||s.original_sha256!==e.original_sha256||s.canonical_sha256!==e.canonical_sha256||
        s.source_parcel_reference!==parcel.source_parcel_reference||s.source_original_json!==e.source_original_text||s.code_collected_at!==e.collected_at||
        (s.source_status??null)!==e.status_as_collected||(s.opened_date??null)!==e.case_opened_date||(s.violation_date??null)!==e.violation_date||
        !text(s.case_id)||!nullable(s.original_description??null)||!nullable(s.source_attribution??null)||!nullable(s.source_notice??null)||!url(s.code_source_url)||!url(s.terms_url)||await digest(e.source_original_text)!==e.original_sha256)return fail();
      events.push({recordKey:e.record_key,caseId:s.case_id,description:s.original_description??null,status:e.status_as_collected,collectedAt:e.collected_at,
        caseOpened:e.case_opened_date,violationDate:e.violation_date,sourceUrl:s.code_source_url,termsUrl:s.terms_url,attribution:s.source_attribution??null,sourceNotice:s.source_notice??null,
        originalText:e.source_original_text,originalSha256:e.original_sha256,deliveryId:e.delivery_id,processingRunId:e.processing_run_id,preparation:e.preparation_sha256});
    }
    result.push({propertyId:p.property_id,sourcePropertyId:p.source_property_id,mappingId:p.mapping_id,acceptanceId:p.acceptance_id,reviewId:p.review_event_id,
      address:p.address,city:p.city,state:p.state,zip:p.zip,parcelOriginalText:p.parcel_evidence_original_text,parcelSha256:p.parcel_evidence_sha256,events});
  }
  return result;
}
export async function loadSourceCrmDetail(client:SourceActionRpc,actor:string,leadId:string,propertyId:string,signal:AbortSignal):Promise<SourceCrmGroup[]> {
  if(!id(leadId)||!id(propertyId))throw new Error('The saved CRM reference is invalid.');
  const data=await sourceRpc(client,actor,'fn_get_source_crm_detail_v1',{p_lead_id:leadId},signal);
  const result=await parseSourceCrmDetail(data,propertyId);
  const current=await boundedSourceRequest(signal,()=>client.auth.getUser());
  if(signal.aborted||current.error||current.data?.user?.id!==actor)throw new Error('Your account changed. Open this lead again after signing in.');
  return result;
}
