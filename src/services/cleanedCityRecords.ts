import { z } from 'zod';
const sha=z.string().regex(/^[0-9a-f]{64}$/),uuid=z.string().uuid(),text=z.string().min(1).max(1500),day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const citation=z.object({agency_key:text,request_id:uuid,receipt_id:uuid,source_job_id:uuid,original_sha256:sha,source_row_sha256:sha,
  source_rows:z.array(z.number().int().positive()).min(1).max(2),report_date:day,case_id:text,record_kind:z.literal('case')}).strict();
const insight=z.object({version:z.literal('cleaned-private-case-insight-v1'),generation_method:z.literal('source_fact_summary'),
  documented_facts:z.array(z.object({text,source:citation}).strict()).length(1),
  possible_investor_implications:z.array(z.object({text,basis:z.literal('interpretation_not_documented_condition'),source:citation}).strict()).length(1),
  limitations:z.array(text).min(1).max(5),cleaned_evidence_only:z.literal(true),provider_calls:z.literal(0)}).strict();
const record=z.object({record_key:sha,version_id:sha,record_kind:z.literal('case'),case_id:text,address:text,city:text,state:z.string().length(2),
  filed_date:day,closed_date:day.nullable(),status:z.string().max(100),cleaned_description:text,cleaning_rule_version:text,cleaned_sha256:sha,
  receipt_id:uuid,source_job_id:uuid,insight,state_label:z.literal('insight_ready')}).strict();
const page=z.object({version:z.literal('private-cleaned-records-v1'),records:z.array(record).max(100),total:z.number().int().nonnegative()}).strict();
export type CleanedCityPage=z.infer<typeof page>;
export async function parseCleanedCityPage(data:unknown):Promise<CleanedCityPage>{
  const result=page.parse(data);
  if(result.total<result.records.length || new Set(result.records.map(r=>r.version_id)).size!==result.records.length)throw Error('City record counts do not reconcile.');
  for(const r of result.records){
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(r.cleaned_description))))).map(x=>x.toString(16).padStart(2,'0')).join('');
    if(digest!==r.cleaned_sha256 || r.insight.documented_facts[0].text!==r.cleaned_description)throw Error('City cleaning evidence does not match.');
    for(const f of [...r.insight.documented_facts,...r.insight.possible_investor_implications])
      if(f.source.receipt_id!==r.receipt_id || f.source.source_job_id!==r.source_job_id || f.source.case_id!==r.case_id)throw Error('City source links do not match.');
  }
  return result;
}
export interface CleanedRpc {rpc(name:string,parameters:Record<string,unknown>):{abortSignal(signal:AbortSignal):PromiseLike<{data:unknown,error:unknown}>};}
export async function loadCleanedCityRecords(client:CleanedRpc,offset:number,signal:AbortSignal):Promise<CleanedCityPage>{
  const {data,error}=await client.rpc('fn_private_cleaned_records_v1',{p_limit:25,p_offset:offset}).abortSignal(signal);
  if(error)throw Error('Private city records are unavailable. Try refreshing.');
  return parseCleanedCityPage(data);
}
