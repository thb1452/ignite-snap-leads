import test from 'node:test';
import assert from 'node:assert/strict';
import {parseReviewPage, loadSourceReview, loadSourceReviewBatches, ReviewAccessError, sourceLink} from '../src/services/sourceReview.ts';
import {batchId, reviewPage} from './source-review-fixture.mjs';

test('all 63 distinct violations survive pagination even when they share a case',()=>{
  const pages=[0,25,50].map(offset=>parseReviewPage(reviewPage(offset),batchId,offset));
  assert.equal(new Set(pages.flatMap(p=>p.events.map(e=>e.record_key))).size,63);
  assert.equal(pages[2].events.length,13);assert.equal(pages[2].next_offset,null);
  assert.ok(pages.every(p=>p.batch.property_count===29));
});
test('wrong batch, repeated rows, incomplete pages and inconsistent counts are rejected',()=>{
  for(const change of [p=>{p.batch.preparation_sha256='f'.repeat(64);},p=>{p.events[1]=p.events[0];},p=>{p.events.pop();},p=>{p.batch.property_count=64;},p=>{p.next_offset=50;}]) {
    const p=reviewPage();change(p);assert.throws(()=>parseReviewPage(p,batchId,0));
  }
});
test('denied or malformed replies cannot become an empty successful review',()=>{
  assert.throws(()=>parseReviewPage({status:'unavailable',batch:null,events:[]},batchId,0),ReviewAccessError);
  assert.throws(()=>parseReviewPage({},batchId,0));
});
test('transport submits only the selected batch and bounded page; provider errors are sanitized',async()=>{
  let request;
  const client={rpc:(name,args)=>{request={name,args};return {abortSignal:async()=>({data:reviewPage(25),error:null})};}};
  await loadSourceReview(client,batchId,25,new AbortController().signal);
  assert.deepEqual(request,{name:'fn_owner_source_review_v1',args:{p_preparation_sha256:batchId,p_limit:25,p_offset:25}});
  client.rpc=()=>({abortSignal:async()=>({data:null,error:{code:'XX000',message:'private internals'}})});
  await assert.rejects(()=>loadSourceReview(client,batchId,0,new AbortController().signal),error=>!error.message.includes('private internals'));
});
test('source links reject scripts, credentials and insecure destinations',()=>{
  for(const url of ['javascript:alert(1)','https://user:pass@example.gov','http://example.gov',null])assert.equal(sourceLink(url),null);
  assert.equal(sourceLink('https://example.gov/records'),'https://example.gov/records');
});
test('batch list and detail use the admitted selection instead of a hardcoded first delivery',async()=>{
  const nextBatch='b'.repeat(64);
  const batch={...reviewPage().batch,preparation_sha256:nextBatch};
  let selected;
  const client={rpc:(name,args)=>({abortSignal:async()=>{
    if(name==='fn_owner_source_review_batches_v1')return {data:{version:'owner-source-review-batches-v1',checked_at:'2026-09-09T05:00:00Z',batches:[batch],total_count:1,truncated:false},error:null};
    selected=args.p_preparation_sha256;return {data:{...reviewPage(),batch},error:null};
  }})};
  const list=await loadSourceReviewBatches(client,new AbortController().signal);
  await loadSourceReview(client,list.batches[0].preparation_sha256,0,new AbortController().signal);
  assert.equal(selected,nextBatch);
});
