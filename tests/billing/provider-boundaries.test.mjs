import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { reconcileBilling } from '../../scripts/reconcile-billing-readonly.mjs';
function moduleUrl(path,replace={}) { let source=readFileSync(new URL(path,import.meta.url),'utf8');for(const [from,to]of Object.entries(replace)) source=source.replace(from,to);return 'data:text/javascript;base64,'+Buffer.from(ts.transpile(source,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022})).toString('base64'); }
const planUrl=moduleUrl('../../supabase/functions/_shared/stripeSubscriptionPlan.ts');
const sync=await import(moduleUrl('../../supabase/functions/_shared/billingSync.ts',{'./stripeSubscriptionPlan.ts':planUrl}));
const {cancelOwnedSubscriptions}=await import(moduleUrl('../../supabase/functions/_shared/billingClosure.ts'));
test('paid-through uses paid recurring line period, not invoice window or proration',()=>{
const invoice={status:'paid',paid:true,period_end:999,lines:{data:[{type:'subscription',subscription:'sub_test',proration:false,period:{end:2000}},{type:'subscription',subscription:'sub_test',proration:true,period:{end:9999}}]}};
assert.equal(sync.paidPeriodEnd(invoice,'sub_test'),new Date(2000*1000).toISOString());
assert.equal(sync.paidPeriodEnd({...invoice,status:'open',paid:false},'sub_test'),null);
assert.equal(sync.paidPeriodEnd(invoice,'sub_other'),null);
});
test('completed but unpaid asynchronous session cannot fulfill',()=>{
assert.throws(()=>sync.checkoutPayment({payment_status:'unpaid'}),/checkout_payment_pending/);
assert.throws(()=>sync.checkoutPayment({payment_status:'paid',metadata:{user_id:'u',checkout_type:'bulk_credits',credit_count:'90000000'}}),/checkout_pack_invalid/);
});
test('RPC failure propagates for webhook retry',async()=>{
await assert.rejects(()=>sync.applyBilling({rpc:async()=>({error:new Error('db offline')})},{}),/db offline/);
});
function provider({failure=false,unconfirmed=false,unownedActive=false}={}) {
const calls=[];let status='active'; const sub=()=>({id:'sub_test',customer:'cus_test',status,metadata:{user_id:'u'}});
return {calls,stripe:{customers:{list:()=>({async *[Symbol.asyncIterator](){yield {id:'cus_test',metadata:{supabase_user_id:'u'}};}})},subscriptions:{
retrieve:async id=>{calls.push(['retrieve',id]);return sub();},
list:()=>({async *[Symbol.asyncIterator](){yield sub();yield {id:'sub_other',customer:'cus_test',status:unownedActive?'active':'canceled',metadata:{user_id:'other'}};}}),
cancel:async(id,options)=>{calls.push(['cancel',id,options]);if(failure)throw new Error('stripe offline');if(!unconfirmed)status='canceled';return sub();}
}}};}
const mapping=[{stripe_subscription_id:'sub_test',stripe_customer_id:'cus_test',status:'active'}];
test('closure cancels only owned subscriptions and verifies cancellation',async()=>{
const p=provider();await cancelOwnedSubscriptions(p.stripe,'u','example@example.com',mapping);
assert.deepEqual(p.calls.filter(c=>c[0]==='cancel').map(c=>c[1]),['sub_test']);
assert.equal(p.calls.at(-1)[0],'retrieve');assert.deepEqual(p.calls.find(c=>c[0]==='cancel')[2],{prorate:false,invoice_now:false});
});
test('cancellation failure or unconfirmed cancellation stops account closure',async()=>{
for(const options of [{failure:true},{unconfirmed:true}]){const p=provider(options);await assert.rejects(()=>cancelOwnedSubscriptions(p.stripe,'u',undefined,mapping));}
});
test('missing provider mapping cannot silently erase a possibly billed account',async()=>{
const p=provider();await assert.rejects(()=>cancelOwnedSubscriptions(p.stripe,'u',undefined,[{stripe_subscription_id:null,stripe_customer_id:null,status:'active'}]),/billing_mapping_requires_review/);assert.equal(p.calls.length,0);
});
test('read-only reconciliation does not declare missing active-only export canceled',()=>{
const row={id:'private-id',user_id:'private-user',status:'active',stripe_subscription_id:'sub_private',current_period_end:'2026-04-01T00:00:00Z'};
const report=reconcileBilling({observed_at:'2026-09-24T00:00:00Z',database_subscriptions:[row],stripe_subscriptions:[],stripe_export_complete:false});
assert.equal(report.discrepancies[0].provider_status,'unverified');assert.ok(report.discrepancies[0].flags.includes('provider_snapshot_incomplete'));
assert.ok(!JSON.stringify(report).includes('private-id'));assert.equal(row.status,'active');
});

function loadHandler(path,{client={},Stripe,extra={}}) {
  let handler;
  const source=readFileSync(new URL(path,import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');
  const js=ts.transpile(source,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022});
  const deno={env:{get:()=> 'test-only-value'},serve:callback=>{handler=callback;}};
  new Function('Deno','createClient','Stripe',...Object.keys(extra),js)(deno,()=>client,Stripe,...Object.values(extra));
  return handler;
}
test('checkout hold and unavailable gate block provider writes before creating customer or payment',async()=>{
  for(const gate of [{data:false,error:null},{data:null,error:new Error('db unavailable')}]) {
    let writes=0;
    class FakeStripe { static createFetchHttpClient(){return {};} customers={create:()=>{writes++;}}; checkout={sessions:{create:()=>{writes++;}}}; }
    const handler=loadHandler('../../supabase/functions/create-checkout-session/index.ts',{Stripe:FakeStripe,client:{auth:{getUser:async()=>({data:{user:{id:'u'}},error:null})},rpc:async()=>gate},extra:{STRIPE_SUBSCRIPTION_PRICE_IDS_BY_PLAN:{}}});
    const response=await handler(new Request('https://test.invalid',{method:'POST',headers:{authorization:'Bearer test'},body:JSON.stringify({checkout_type:'bulk_credits',credit_count:5000})}));
    assert.equal(response.status,503);assert.equal(writes,0);
  }
});
test('webhook verifies original body and reports failed atomic persistence as retryable',async()=>{
  const raw='{"untouched":"body"}';let seen;
  class FakeStripe { static createFetchHttpClient(){return {};} webhooks={constructEventAsync:async body=>{seen=body;return {id:'evt_fixture',type:'checkout.session.completed',data:{object:{id:'cs_fixture'}}};}};checkout={sessions:{retrieve:async()=>({id:'cs_fixture',mode:'payment',payment_status:'paid'})}}; }
  const handler=loadHandler('../../supabase/functions/stripe-webhook/index.ts',{Stripe:FakeStripe,extra:{checkoutPayment:()=>({user_id:'u'}),applyBilling:async()=>{throw new Error('injected DB failure');},stripeObjectId:sync.stripeObjectId,subscriptionSnapshot:async()=>{throw new Error('unexpected');}}});
  const response=await handler(new Request('https://test.invalid',{method:'POST',headers:{'stripe-signature':'test-only'},body:raw}));
  assert.equal(seen,raw);assert.equal(response.status,500);
});
test('invalid webhook signature prevents any provider lookup or fulfillment',async()=>{
  let applyCalls=0;
  class FakeStripe { static createFetchHttpClient(){return {};} webhooks={constructEventAsync:async()=>{throw new Error('bad signature');}}; }
  const handler=loadHandler('../../supabase/functions/stripe-webhook/index.ts',{Stripe:FakeStripe,extra:{checkoutPayment:()=>{},applyBilling:async()=>{applyCalls++;},stripeObjectId:sync.stripeObjectId,subscriptionSnapshot:async()=>{}}});
  const response=await handler(new Request('https://test.invalid',{method:'POST',headers:{'stripe-signature':'invalid'},body:'invalid'}));
  assert.equal(response.status,400);assert.equal(applyCalls,0);
});

test('an unmapped active subscription prevents a false cancellation-complete claim',async()=>{
const p=provider({unownedActive:true});await assert.rejects(()=>cancelOwnedSubscriptions(p.stripe,'u',undefined,mapping),/billing_subscription_scope_unverified/);
assert.equal(p.calls.filter(c=>c[0]==='cancel').length,0);
});
