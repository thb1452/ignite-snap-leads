import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {buildInvestorOutput, cleanedInvestorCsv} from '../supabase/functions/_shared/cleanInvestorEvidence.ts';
import {validateSourceExportReceipt,sourceExportCsv,sourceExportHash,requestSourceDetailCsv,SOURCE_EXPORT_FORMAT} from '../supabase/functions/_shared/sourceExport.ts';
import {parseCleanSyracuseCatalog} from '../src/services/cleanSyracuseCatalog.ts';

const events=JSON.parse(readFileSync(new URL('./clean-syracuse-fixture.json',import.meta.url),'utf8'));
const canonical=(value:any):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const rehash=(event:any)=>{
 event.record_key=digest(canonical(['city-of-syracuse-ny','source_violation',event.government_violation_id]));
 const {revision_sha256,cleaning_version,cleaned_sha256,citation,source_attribution,source_notice,terms_url,record_grain,limitations,...facts}=event;
 event.revision_sha256=digest(canonical(facts)); event.cleaned_sha256=digest(JSON.stringify(event.cleaned_description));
};
events.forEach(rehash);
const acceptance_id='11111111-1111-4111-8111-111111111111';
const acceptance_revision='a'.repeat(64);
const as_of='2026-09-27T08:00:00Z';
const evidence={version:'accepted-clean-investor-evidence-v1',acceptance_id,acceptance_revision,as_of,events};
const catalog={version:'accepted-clean-syracuse-catalog-v1',as_of,
  items:events.map((event:any)=>({acceptance_id,acceptance_revision,customer_property_id:event.property_id,event})),
  observations:events.map((event:any)=>({acceptance_id,acceptance_revision,customer_property_id:event.property_id,event}))};
const visible=await parseCleanSyracuseCatalog(catalog);
assert.deepEqual(visible.map(p=>p.events.length).sort(),[1,3,5]);
await assert.rejects(()=>parseCleanSyracuseCatalog({...catalog,items:[...catalog.items,{...catalog.items[0]}]}));
const mismapped=structuredClone(catalog);
mismapped.items[0].customer_property_id=events.find((event:any)=>event.property_id!==events[0].property_id).property_id;
await assert.rejects(()=>parseCleanSyracuseCatalog(mismapped),/mapping disagrees|accepted history/);
const briefs=await buildInvestorOutput(evidence);
assert.equal(briefs.length,3);
assert.deepEqual(briefs.map(b=>b.events.length).sort(),[1,3,5]);
assert.ok(briefs.every(b=>b.score.value===null&&b.owner_intent===null&&b.private_contacts===null));
assert.ok(briefs.every(b=>b.documented_open_count_basis.includes('separate selected agency violations')&&
  b.source_notice.includes('City of Syracuse makes no representation')));
const csv=await cleanedInvestorCsv(evidence);
assert.equal(csv.split('\r\n').length,10);
assert.ok(csv.includes('dataset_publication_date') && csv.includes('2024-11-13'));
assert.ok(csv.includes('older_than_freshness_target')&&csv.includes('selection_history_limit'));
assert.ok(!csv.includes('raw_description')&&!csv.includes('private_contact'));
const propertyIds=[...new Set(events.map((e:any)=>e.property_id))] as string[];
const receipt={status:'reserved',request_id:'22222222-2222-4222-8222-222222222222',row_count:3,event_count:9,
  property_ids:propertyIds,
  rows:propertyIds.map(property_id=>({property_id,source_property_id:property_id,
    events:events.filter((e:any)=>e.property_id===property_id)})),
  entitlement:{acceptance_id,acceptance_revision}};
await validateSourceExportReceipt(receipt,receipt.request_id,acceptance_id);
const sourceCsv=await sourceExportCsv(receipt);
assert.equal(sourceCsv.split('\r\n').length,10);
assert.ok(sourceCsv.startsWith('customer_property_id,'));
const values=new Map<string,string>(), sent:string[]=[];
const deps={
  userId:acceptance_id,token:'synthetic-local-token',endpoint:'https://fixture.invalid/export',
  storage:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},
    removeItem:(key:string)=>{values.delete(key);}},
  locks:{request:async (_key:string,run:()=>Promise<unknown>)=>run()},
  fetch:async (_url:string,init:RequestInit)=>{
    const requestId=(init.headers as Record<string,string>)['Idempotency-Key'];
    sent.push(requestId);
    return new Response(sourceCsv,{headers:{
      'X-Export-Content-SHA256':await sourceExportHash(sourceCsv),
      'X-Export-Property-Count':'3','X-Export-Event-Count':'9',
      'X-Export-Format':SOURCE_EXPORT_FORMAT,
      'X-Export-Request-Id':requestId,'X-Export-Acceptance-Id':acceptance_id,
    }});
  },
} as any;
const first=await requestSourceDetailCsv({format:SOURCE_EXPORT_FORMAT,acceptanceId:acceptance_id},deps);
const second=await requestSourceDetailCsv({format:SOURCE_EXPORT_FORMAT,acceptanceId:acceptance_id},deps);
assert.equal(first.csv,sourceCsv);
assert.equal(second.requestId,first.requestId);
assert.deepEqual(sent,[first.requestId,first.requestId]);
for(const mutate of [
  (r:any)=>{r.rows[0].events[0].private_contact='hidden@example.com'},
  (r:any)=>{r.rows[0].events[0].cleaned_description='Call owner at 555-0123'},
  (r:any)=>{r.rows[0].events[0].revision_sha256='b'.repeat(64)},
  (r:any)=>{r.row_count=9},
  (r:any)=>{r.entitlement.acceptance_id='33333333-3333-4333-8333-333333333333'},
]){const altered=structuredClone(receipt);mutate(altered);await assert.rejects(()=>validateSourceExportReceipt(altered,receipt.request_id,acceptance_id));}
console.log(JSON.stringify({synthetic_clean_events:events.length,properties:briefs.length,csv_rows:sourceCsv.split('\r\n').length-1,adversarial_receipts_rejected:5,source:'synthetic privacy and history regression; not production proof'}));

// The same native violation changes status across two accepted observations.
const prior=structuredClone(catalog);
const latest=structuredClone(catalog);
latest.items.forEach((item:any)=>{item.acceptance_id='33333333-3333-4333-8333-333333333333';item.event.citation.delivery_id='00000000-0000-4000-8000-000000000102';item.event.citation.collected_at='2026-09-27T07:24:00Z';});
latest.items[0].event.source_status='Closed'; latest.items[0].event.normalized_status='closed'; rehash(latest.items[0].event);
latest.observations=[...prior.observations,...structuredClone(latest.items)];
const history=await parseCleanSyracuseCatalog(latest);
assert.equal(history.reduce((n,p)=>n+p.events.length,0),9);
assert.equal(history.reduce((n,p)=>n+p.observations.length,0),18);
assert.equal(history.reduce((n,p)=>n+p.openCount,0),8);
assert.ok(history.every(p=>p.insight?.documented_open_count===p.openCount));
assert.equal(history[0].insight?.implications[0].text.includes('closed'),true);
const privateHistory=structuredClone(latest);privateHistory.observations[0].event.private_contact='private@example.invalid';
await assert.rejects(()=>parseCleanSyracuseCatalog(privateHistory));
await assert.rejects(()=>parseCleanSyracuseCatalog({...latest,items:prior.items}),/Latest violation/);
await assert.rejects(()=>parseCleanSyracuseCatalog({...latest,observations:latest.observations.slice(0,-1)}),/history/);
console.log('PASS accepted status history, latest counts, missing observation and private-history rejection');
