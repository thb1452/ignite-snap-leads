import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { reconcileBilling } from '../../scripts/reconcile-billing-readonly.mjs';
function moduleUrl(path,replace={}) { let source=readFileSync(new URL(path,import.meta.url),'utf8');for(const [from,to]of Object.entries(replace)) source=source.replace(from,to);return 'data:text/javascript;base64,'+Buffer.from(ts.transpile(source,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022})).toString('base64'); }
const modeUrl=moduleUrl('../../supabase/functions/_shared/stripeMode.ts');
const mode=await import(modeUrl);
const planUrl=moduleUrl('../../supabase/functions/_shared/stripeSubscriptionPlan.ts');
const sync=await import(moduleUrl('../../supabase/functions/_shared/billingSync.ts',{'./stripeSubscriptionPlan.ts':planUrl,'./stripeMode.ts':modeUrl}));
const {cancelOwnedSubscriptions}=await import(moduleUrl('../../supabase/functions/_shared/billingClosure.ts',{'./stripeMode.ts':modeUrl}));
test('paid-through uses paid recurring line period, not invoice window or proration',()=>{
const invoice={status:'paid',paid:true,period_end:999,lines:{data:[{type:'subscription',subscription:'sub_test',proration:false,period:{end:2000}},{type:'subscription',subscription:'sub_test',proration:true,period:{end:9999}}]}};
assert.equal(sync.paidPeriodEnd(invoice,'sub_test'),new Date(2000*1000).toISOString());
assert.equal(sync.paidPeriodEnd({...invoice,status:'open',paid:false},'sub_test'),null);
assert.equal(sync.paidPeriodEnd(invoice,'sub_other'),null);
});
test('canonical paid upgrade invoiceitem proves the new plan without extending its paid term',()=>{
  const subscription={id:'sub_test',current_period_start:1000,current_period_end:2000,items:{data:[{id:'si_test',price:{id:'price_new'}}]}};
  const debit={type:'invoiceitem',subscription:'sub_test',subscription_item:'si_test',price:{id:'price_new'},proration:true,amount:500,period:{start:1500,end:2000}};
  const credit={...debit,price:{id:'price_old'},amount:-250};
  const invoice={paid:true,status:'paid',subscription:'sub_test',billing_reason:'subscription_update',lines:{data:[credit,debit]}};
  assert.equal(sync.paidPlanVerified(invoice,subscription,'price_new'),true);
  assert.equal(sync.paidPeriodEnd(invoice,'sub_test','price_new'),null);
  for(const changed of [
    {...debit,amount:0},{...debit,amount:-1},{...debit,proration:false},
    {...debit,subscription:'sub_foreign'},{...debit,subscription_item:'si_foreign'},
    {...debit,subscription_item:null},{...debit,price:{id:'price_old'}},
    {...debit,period:{start:500,end:2000}},{...debit,period:{start:2000,end:2000}},
    {...debit,period:{start:1500,end:3000}},
  ]) assert.equal(sync.paidPlanVerified({...invoice,lines:{data:[credit,changed]}},subscription,'price_new'),false);
  for(const changed of [{paid:false},{status:'open'},{subscription:'sub_foreign'},{billing_reason:'manual'}])
    assert.equal(sync.paidPlanVerified({...invoice,...changed},subscription,'price_new'),false);
});
test('paid zero-dollar recurring service retains proof while ordinary invoice items do not',()=>{
  const subscription={id:'sub_test',current_period_start:1000,current_period_end:2000,items:{data:[]}};
  const line={type:'subscription',subscription:'sub_test',price:{id:'price_new'},proration:false,amount:0,period:{start:1000,end:2000}};
  const invoice={paid:true,status:'paid',lines:{data:[line]}};
  assert.equal(sync.paidPlanVerified(invoice,subscription,'price_new'),true);
  assert.equal(sync.paidPeriodEnd(invoice,'sub_test','price_new'),new Date(2000*1000).toISOString());
  assert.equal(sync.paidPlanVerified({...invoice,lines:{data:[{...line,type:'invoiceitem'}]}},subscription,'price_new'),false);
});
test('completed but unpaid asynchronous session cannot fulfill',()=>{
assert.throws(()=>sync.checkoutPayment({payment_status:'unpaid',livemode:false},false),/checkout_payment_pending/);
assert.throws(()=>sync.checkoutPayment({payment_status:'paid',livemode:false,metadata:{user_id:'u',checkout_type:'bulk_credits',credit_count:'90000000'}},false),/checkout_pack_invalid/);
});
test('RPC failure propagates for webhook retry',async()=>{
await assert.rejects(()=>sync.applyBilling({rpc:async()=>({error:new Error('db offline')})},{}),/db offline/);
});
function provider({failure=false,unconfirmed=false,unownedActive=false}={}) {
const calls=[];let status='active'; const sub=()=>({id:'sub_test',customer:'cus_test',status,livemode:false,metadata:{user_id:'u'}});
return {calls,stripe:{customers:{list:()=>({async *[Symbol.asyncIterator](){yield {id:'cus_test',livemode:false,metadata:{supabase_user_id:'u'}};}})},subscriptions:{
retrieve:async id=>{calls.push(['retrieve',id]);return sub();},
list:()=>({async *[Symbol.asyncIterator](){yield sub();yield {id:'sub_other',customer:'cus_test',status:unownedActive?'active':'canceled',livemode:false,metadata:{user_id:'other'}};}}),
cancel:async(id,options)=>{calls.push(['cancel',id,options]);if(failure)throw new Error('stripe offline');if(!unconfirmed)status='canceled';return sub();}
}}};}
const mapping=[{stripe_subscription_id:'sub_test',stripe_customer_id:'cus_test',status:'active'}];
test('closure cancels only owned subscriptions and verifies cancellation',async()=>{
const p=provider();await cancelOwnedSubscriptions(p.stripe,'u','example@example.com',mapping,false);
assert.deepEqual(p.calls.filter(c=>c[0]==='cancel').map(c=>c[1]),['sub_test']);
assert.equal(p.calls.at(-1)[0],'retrieve');assert.deepEqual(p.calls.find(c=>c[0]==='cancel')[2],{prorate:false,invoice_now:false});
});
test('cancellation failure or unconfirmed cancellation stops account closure',async()=>{
for(const options of [{failure:true},{unconfirmed:true}]){const p=provider(options);await assert.rejects(()=>cancelOwnedSubscriptions(p.stripe,'u',undefined,mapping,false));}
});
test('missing provider mapping cannot silently erase a possibly billed account',async()=>{
const p=provider();await assert.rejects(()=>cancelOwnedSubscriptions(p.stripe,'u',undefined,[{stripe_subscription_id:null,stripe_customer_id:null,status:'active'}],false),/billing_mapping_requires_review/);assert.equal(p.calls.length,0);
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
  const deno={env:{get:name=>name==='STRIPE_EXPECTED_LIVEMODE'?'false':name==='STRIPE_SECRET_KEY'?'sk_test_fixture':'test-only-value'},serve:callback=>{handler=callback;}};
  extra={expectedStripeMode:mode.expectedStripeMode,assertStripeObjectMode:mode.assertStripeObjectMode,...extra};
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
  class FakeStripe { static createFetchHttpClient(){return {};} webhooks={constructEventAsync:async body=>{seen=body;return {id:'evt_fixture',livemode:false,type:'checkout.session.completed',data:{object:{id:'cs_fixture'}}};}};checkout={sessions:{retrieve:async()=>({id:'cs_fixture',mode:'payment',livemode:false,payment_status:'paid'})}}; }
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
const p=provider({unownedActive:true});await assert.rejects(()=>cancelOwnedSubscriptions(p.stripe,'u',undefined,mapping,false),/billing_subscription_scope_unverified/);
assert.equal(p.calls.filter(c=>c[0]==='cancel').length,0);
});

test('Stripe mode is explicit and key mode must agree',()=>{
assert.equal(mode.expectedStripeMode('false','sk_test_fixture'),false);
assert.equal(mode.expectedStripeMode('true','rk_live_fixture'),true);
assert.throws(()=>mode.expectedStripeMode(undefined,'sk_live_fixture'),/STRIPE_EXPECTED_LIVEMODE_REQUIRED/);
assert.throws(()=>mode.expectedStripeMode('false','sk_live_fixture'),/STRIPE_KEY_MODE_MISMATCH/);
assert.throws(()=>mode.expectedStripeMode('true','rk_test_fixture'),/STRIPE_KEY_MODE_MISMATCH/);
assert.throws(()=>mode.assertStripeObjectMode({livemode:false},true),/STRIPE_OBJECT_MODE_MISMATCH/);
assert.throws(()=>mode.assertStripeObjectMode({},false),/STRIPE_OBJECT_MODE_MISMATCH/);
});
test('signed event from the other mode cannot touch persistence',async()=>{
let applied=0;
class FakeStripe {static createFetchHttpClient(){return {};} webhooks={constructEventAsync:async()=>({id:'evt_wrong_mode',livemode:true,type:'checkout.session.completed',data:{object:{id:'cs'}}})};}
const handler=loadHandler('../../supabase/functions/stripe-webhook/index.ts',{Stripe:FakeStripe,extra:{checkoutPayment:()=>{},applyBilling:async()=>{applied++;},stripeObjectId:sync.stripeObjectId,subscriptionSnapshot:async()=>{applied++;}}});
const response=await handler(new Request('https://test.invalid',{method:'POST',headers:{'stripe-signature':'fixture'},body:'{}'}));
assert.equal(response.status,400);assert.equal(applied,0);
});
test('canonical provider object mode is checked independently of signed event mode',async()=>{
let applied=0;
class FakeStripe {static createFetchHttpClient(){return {};} webhooks={constructEventAsync:async()=>({id:'evt_right_mode',livemode:false,type:'checkout.session.completed',data:{object:{id:'cs'}}})};checkout={sessions:{retrieve:async()=>({id:'cs',livemode:true,mode:'payment',payment_status:'paid'})}};}
const handler=loadHandler('../../supabase/functions/stripe-webhook/index.ts',{Stripe:FakeStripe,extra:{checkoutPayment:()=>{},applyBilling:async()=>{applied++;},stripeObjectId:sync.stripeObjectId,subscriptionSnapshot:async()=>{applied++;}}});
const response=await handler(new Request('https://test.invalid',{method:'POST',headers:{'stripe-signature':'fixture'},body:'{}'}));
assert.equal(response.status,500);assert.equal(applied,0);
});
