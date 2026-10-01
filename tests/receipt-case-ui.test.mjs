import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {QueryClient, QueryObserver, MutationObserver} from '@tanstack/react-query';
import {RECEIPT_CASE_LIMITATIONS} from '../src/services/receiptCaseContract.ts';
import {receiptCaseService, parseReceiptAcceptances, parseReceiptProperties, receiptKey, receiptIsCurrent,
  visibleReceiptData, readReceiptWithoutFallback, scheduleReceiptExpiry, evictReceiptSourceCache, privateActivities, receiptHandoffPlan} from '../src/services/receiptCases.ts';

const id=n=>`66666666-6666-4666-8666-${String(n).padStart(12,'0')}`;
const hash=value=>createHash('sha256').update(value).digest('hex');
const future=()=>new Date(Date.now()+3600000).toISOString();
const acceptance=()=>({acceptance_id:id(1),snapshot_id:id(2),report_date:'2024-03-01',valid_until:future(),evidence_kind:'synthetic',
  original_count:3,reviewed_count:2,held_count:1,coverage:'reviewed_subset',freshness:'dated_snapshot',cadence:'unverified'});
const page=a=>({version:'receipt-case-properties-v1',acceptance_id:a.acceptance_id,snapshot_id:a.snapshot_id,total:1,
  properties:[{source_property_key:hash('synthetic property'),property_id:id(3),address:'1 Synthetic Lane',city:'Fixture City',state:'ZZ',case_count:2,report_date:a.report_date,existing_lead_id:null}]});
function detail(){
  const a=acceptance(),p=page(a).properties[0];
  const citation={agency_key:'synthetic:agency',request_id:id(4),receipt_id:id(5),source_job_id:id(6),archive_id:id(7),
    archive_manifest_sha256:hash('synthetic manifest'),original_sha256:hash('synthetic original'),source_row_sha256:hash('synthetic row'),source_rows:[4,5],report_date:a.report_date};
  const description='Synthetic case summary <script>never execute</script>',caseId='SYNTHETIC-1',rule='synthetic-cleaning-v1';
  const recordKey=hash(JSON.stringify([citation.agency_key,'case',caseId]));
  return {version:'receipt-case-crm-detail-v1',lead_id:id(8),property:{id:p.property_id,address:p.address,city:p.city,state:p.state},
    snapshot:{...a,received_at:'2024-03-02T12:00:00Z'},cases:[{record_kind:'case',record_key:recordKey,
      version_id:hash(recordKey+citation.original_sha256+citation.source_row_sha256+rule),case_id:caseId,category:'Fixture category',status:'',filed_date:'2024-02-29',closed_date:null,
      cleaned_description:description,cleaned_sha256:hash(JSON.stringify(description)),cleaning_rule_version:rule,citation}],limitations:[...RECEIPT_CASE_LIMITATIONS]};
}
const signal=()=>new AbortController().signal;
function client(response){const calls=[];return {calls,rpc(name,args){calls.push({name,args});return {abortSignal:async s=>typeof response==='function'?response(name,args,s):{data:response,error:null}};}};}

test('list and property pages bind exact acceptance/snapshot, counts and dates with no partial fallback',()=>{
  const a=acceptance(),p=page(a);
  assert.deepEqual(parseReceiptAcceptances({version:'receipt-case-acceptances-v1',acceptances:[a]}),[a]);
  assert.deepEqual(parseReceiptProperties(p,a,0),p);
  for(const mutated of [{...p,acceptance_id:id(99)},{...p,snapshot_id:id(99)},{...p,total:2},
    {...p,properties:[{...p.properties[0],report_date:'2024-02-28'}]},
    {...p,total:2,properties:[p.properties[0],p.properties[0]]}])assert.throws(()=>parseReceiptProperties(mutated,a,0));
  assert.throws(()=>parseReceiptAcceptances({version:'receipt-case-acceptances-v1',acceptances:[a,a]}));
  assert.throws(()=>parseReceiptAcceptances({version:'receipt-case-acceptances-v1',acceptances:[{...a,held_count:0}]}));
});

test('customer reader uses exact receipt RPC only; identity, detail target and deadline remain enforced after asynchronous parsing',async()=>{
  const data=detail(),actor=id(10),c=client(data);let current=actor,checks=0;
  const verify=async expected=>{checks++;assert.equal(current,expected);};
  const service=receiptCaseService(c,verify);
  assert.deepEqual(await service.detail(actor,data.lead_id,data.property.id,signal()),data);
  assert.equal(checks,3);assert.deepEqual(c.calls,[{name:'fn_get_receipt_case_crm_detail_v1',args:{p_lead_id:data.lead_id}}]);
  await assert.rejects(service.detail(actor,id(99),data.property.id,signal()));
  await assert.rejects(service.detail(actor,data.lead_id,id(99),signal()));
  const expired={...data,snapshot:{...data.snapshot,valid_until:'2000-01-01T00:00:00Z'}};
  await assert.rejects(receiptCaseService(client(expired),verify).detail(actor,data.lead_id,data.property.id,signal()));
  let afterChecks=0;
  await assert.rejects(receiptCaseService(client(data),async expected=>{afterChecks++;if(afterChecks===3)current=id(11);assert.equal(current,expected);}).detail(actor,data.lead_id,data.property.id,signal()));
  current=actor;
  const denied=client(()=>({data:null,error:{code:'42501'}}));
  await assert.rejects(receiptCaseService(denied,verify).detail(actor,data.lead_id,data.property.id,signal()));
  assert.equal(denied.calls.length,1);assert.equal(denied.calls[0].name,'fn_get_receipt_case_crm_detail_v1');
  const controller=new AbortController();controller.abort();
  const before=c.calls.length;await assert.rejects(service.detail(actor,data.lead_id,data.property.id,controller.signal));assert.equal(c.calls.length,before);
});

test('receipt page bounds prevent excess calls and delayed account switches discard responses',async()=>{
  const a=acceptance(),actor=id(10),calls=client(page(a));let current=actor;
  const verify=async expected=>assert.equal(current,expected),service=receiptCaseService(calls,verify);
  assert.deepEqual(await service.properties(actor,a,0,signal()),page(a));
  assert.deepEqual(calls.calls[0],{name:'fn_list_receipt_case_properties_v1',args:{p_acceptance_id:a.acceptance_id,p_limit:25,p_offset:0}});
  for(const offset of [-1,1001,0.5])await assert.rejects(service.properties(actor,a,offset,signal()));
  await assert.rejects(service.properties(actor,{...a,valid_until:'2000-01-01T00:00:00Z'},0,signal()));
  assert.equal(calls.calls.length,1);
  let release;const delayed=client(()=>new Promise(resolve=>{release=resolve;}));
  const pending=receiptCaseService(delayed,verify).properties(actor,a,0,signal());
  await Promise.resolve();await Promise.resolve();current=id(11);release({data:page(a),error:null});await assert.rejects(pending);
});

test('real query cache drops failed source refresh and caller/page keys cannot reuse another selection',async t=>{
  const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});t.after(()=>qc.clear());
  const actor=id(10),key=receiptKey(actor,'properties',id(1),0),payload=page(acceptance());
  let fail=false;
  const options={queryKey:key,queryFn:()=>readReceiptWithoutFallback(async()=>{if(fail)throw Error('denied');return payload;}),retry:false};
  await qc.fetchQuery(options);assert.equal(qc.getQueryData(key).value.properties[0].address,'1 Synthetic Lane');
  assert.equal(qc.getQueryData(receiptKey(id(11),'properties',id(1),0)),undefined);
  assert.equal(qc.getQueryData(receiptKey(actor,'properties',id(2),0)),undefined);
  assert.equal(qc.getQueryData(receiptKey(actor,'properties',id(1),25)),undefined);
  const observer=new QueryObserver(qc,options),unsubscribe=observer.subscribe(()=>{});t.after(unsubscribe);
  fail=true;await observer.refetch();assert.deepEqual(qc.getQueryData(key),{ok:false});
  for(const state of [{isSuccess:false,isFetching:false,isError:false},{isSuccess:true,isFetching:true,isError:false},
    {isSuccess:true,isFetching:false,isError:true},{isSuccess:true,isFetching:false,isError:false,fetchStatus:'paused'}])
    assert.equal(visibleReceiptData({...state,data:payload}),undefined);
  assert.equal(visibleReceiptData({data:payload,isSuccess:true,isFetching:false,isError:false},'2000-01-01T00:00:00Z'),undefined);
  assert.equal(JSON.stringify(qc.getQueryData(key)).includes('Synthetic Lane'),false);
});

test('expiry rechecks clock after suspension and evicts only source caches while private work survives',()=>{
  const qc=new QueryClient(),actor=id(10),deadline=100000;let now=0,callback,cleared=0;
  const receipt=receiptKey(actor,'properties',id(1),0),evidence=['crm',actor,'evidence',id(8)],notes=['crm',actor,'activities',id(8)],contacts=['crm',actor,'contacts',id(8)],lead=['crm',actor,'lead',id(8)];
  for(const key of [receipt,evidence,notes,contacts,lead])qc.setQueryData(key,{sentinel:key[2]});
  const cancel=scheduleReceiptExpiry(new Date(deadline).toISOString(),()=>evictReceiptSourceCache(qc,actor),{
    now:()=>now,set:(fn,ms)=>{assert.ok(ms<=60000);callback=fn;return 1;},clear:()=>{cleared++;},
  });
  now=deadline+1;callback();assert.equal(qc.getQueryData(receipt),undefined);assert.equal(qc.getQueryData(evidence),undefined);
  for(const key of [notes,contacts,lead])assert.deepEqual(qc.getQueryData(key),{sentinel:key[2]});
  cancel();assert.equal(cleared,1);assert.equal(receiptIsCurrent(new Date(deadline).toISOString(),deadline),false);
  const privateRows=[{activity_type:'note',payload:{note:'Private work'}},{activity_type:'task',payload:{outcome:'research'}},{activity_type:'system',payload:{event:'source_snapshot_linked',description:'Restricted source annotation'}}];
  assert.deepEqual(privateActivities(privateRows),privateRows.slice(0,2));qc.clear();
});

test('lost handoff acknowledgement retries exact command and accepts the original deduplicated source link',async()=>{
  const command={requestId:id(20),acceptanceId:id(1),propertyKey:hash('synthetic property'),stageId:id(21)};
  let acknowledged=false;
  const rpc=client(()=>({data:acknowledged?{lead_id:id(8),activity_id:id(22),source_link_id:id(23),created:false,replayed:true}:null,error:null}));
  const service=receiptCaseService(rpc,async()=>{});
  await assert.rejects(service.handoff(id(10),command));acknowledged=true;
  const result=await service.handoff(id(10),command);assert.equal(result.replayed,true);assert.equal(result.source_link_id,id(23));
  assert.deepEqual(rpc.calls[0],rpc.calls[1]);assert.equal(rpc.calls[0].name,'fn_handoff_receipt_case_to_crm_v1');
});

test('nondefault handoff retains its command during row refresh and reopens the exact linked lead after navigation/reload',async()=>{
  const a=acceptance(),property=page(a).properties[0],attempts=new Map();
  const first=receiptHandoffPlan(property,a.acceptance_id,id(21),attempts,()=>id(20));
  const retry=receiptHandoffPlan(property,a.acceptance_id,id(22),attempts,()=>id(99));
  assert.deepEqual(retry,first);assert.equal(retry.command.stageId,id(21));
  const refreshed={...property,existing_lead_id:id(8)};
  assert.deepEqual(receiptHandoffPlan(refreshed,a.acceptance_id,id(22),new Map(),()=>{throw Error('Must not allocate a new command');}),{kind:'open',leadId:id(8)});
  const newer=receiptHandoffPlan(property,id(77),id(22),new Map(),()=>id(78));
  assert.equal(newer.kind,'handoff');assert.equal(newer.command.acceptanceId,id(77));
  // Model the actual durable parent observer: child source query can unsubscribe
  // during refetch without disposing the parent's in-flight mutation callbacks.
  const qc=new QueryClient();let resolve,confirmed=0;
  const parent=new MutationObserver(qc,{mutationFn:()=>new Promise(done=>{resolve=done;})});
  const stopParent=parent.subscribe(()=>{});
  const child=new QueryObserver(qc,{queryKey:receiptKey(id(10),'properties',a.acceptance_id,0),queryFn:async()=>({})});
  const stopChild=child.subscribe(()=>{});
  const pending=parent.mutate(first.command,{onSuccess:()=>{confirmed++;}});
  await Promise.resolve();await Promise.resolve();stopChild();resolve({lead_id:id(8)});await pending;
  assert.equal(confirmed,1);stopParent();qc.clear();
});

test('customer parsers consume actual isolated PostgreSQL RPC responses and reopen a changed-stage lead',async t=>{
  const {createReceiptDb,asRole,newUser,syntheticSnapshot,register,grant,reviewAndAccept}=await import('../scripts/tests/release-hosted-source/fixture.mjs');
  const db=await createReceiptDb();t.after(()=>db.close());
  const operator=id(101),actor=id(102),snapshot=syntheticSnapshot({seed:10000}),acceptanceId=id(103);
  await newUser(db,operator);const org=await newUser(db,actor);
  await register(db,snapshot);await grant(db,{grantId:id(104),snapshotId:snapshot.snapshot.id,operator});
  await reviewAndAccept(db,{scope:snapshot,operator,consumer:actor,reviewId:id(105),acceptanceId});
  const rpc=async(name,args=[]) => (await db.query(`SELECT public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) value`,args)).rows[0].value;
  await asRole(db,'authenticated',actor,async()=>{
    const [accepted]=parseReceiptAcceptances(await rpc('fn_my_receipt_case_acceptances_v1'));
    const first=parseReceiptProperties(await rpc('fn_list_receipt_case_properties_v1',[acceptanceId,25,0]),accepted,0);
    const property=first.properties[0];assert.equal(property.existing_lead_id,null);
    const stages=(await db.query('SELECT id FROM public.pipeline_stages WHERE org_id=$1 ORDER BY sort_order,id',[org])).rows;
    const linked=await rpc('fn_handoff_receipt_case_to_crm_v1',[id(106),acceptanceId,property.source_property_key,stages[1].id]);
    await db.query('UPDATE public.leads SET stage_id=$1 WHERE id=$2',[stages[2].id,linked.lead_id]);
    const reopened=parseReceiptProperties(await rpc('fn_list_receipt_case_properties_v1',[acceptanceId,25,0]),accepted,0).properties.find(row=>row.source_property_key===property.source_property_key);
    assert.equal(reopened.existing_lead_id,linked.lead_id);
    assert.deepEqual(receiptHandoffPlan(reopened,acceptanceId,stages[0].id,new Map()),{kind:'open',leadId:linked.lead_id});
    // These RPC-only source facts cannot leak into ordinary property caches.
    assert.deepEqual((await db.query('SELECT id,address FROM public.properties WHERE id=$1',[property.property_id])).rows,[]);
  });
});

test('rendered case evidence identifies synthetic, dated subset and limitations and escapes cleaned text',async()=>{
  const output=await build({stdin:{contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {ReceiptCaseEvidence} from './src/components/crm/ReceiptCaseEvidence.tsx';export const render=detail=>renderToStaticMarkup(React.createElement(ReceiptCaseEvidence,{detail}));`,resolveDir:process.cwd(),sourcefile:'synthetic-receipt-render.tsx'},bundle:true,platform:'node',format:'cjs',jsx:'automatic',write:false,packages:'external',logLevel:'silent'});
  const module={exports:{}};new Function('require','module','exports',output.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const html=module.exports.render(detail());
  assert.match(html,/Synthetic test records/);assert.match(html,/Report date: 2024-03-01/);assert.match(html,/Reviewed subset: 2 of 3 cases/);
  for(const limitation of RECEIPT_CASE_LIMITATIONS)assert.ok(html.includes(limitation));
  assert.match(html,/&lt;script&gt;never execute&lt;\/script&gt;/);assert.ok(!html.includes('<script>'));assert.match(html,/Status not supplied/);
});
