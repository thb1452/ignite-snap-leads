/**
 * Opt-in real Stripe SANDBOX smoke/lifecycle test. Never loads production credentials.
 * Requires SNAP_STRIPE_SANDBOX_KEY (test key), SNAP_STRIPE_EXPECTED_ACCOUNT,
 * SNAP_STRIPE_CLI, SNAP_STRIPE_RUNTIME
 * (scratch npm prefix containing stripe@14.21.0), SNAP_STRIPE_SANDBOX_REPORT.
 * Uses authentic Stripe CLI forwarded signatures and unchanged production handler/
 * helper source. Only the Supabase transport is replaced by isolated PostgreSQL SQL.
 * Not a deployed Supabase gateway, browser Checkout UX, or property delivery test.
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {randomUUID,createHash} from 'node:crypto';
import ts from 'typescript';
import {database} from '../tests/billing/sandbox/database.mjs';

const key=process.env.SNAP_STRIPE_SANDBOX_KEY;
assert.ok(/^(?:sk_test_|rk_test_|rkcs_test_)/.test(key??''),'an explicit TEST-only sandbox key is required');
const cli=process.env.SNAP_STRIPE_CLI;
const expectedAccount=process.env.SNAP_STRIPE_EXPECTED_ACCOUNT;
assert.ok(cli && expectedAccount && process.env.SNAP_STRIPE_RUNTIME && process.env.SNAP_STRIPE_SANDBOX_REPORT,'expected account, CLI, scratch runtime and private report paths required');
const require=createRequire(`${process.env.SNAP_STRIPE_RUNTIME}/package.json`);
const Stripe=require('stripe');
assert.equal(Stripe.PACKAGE_VERSION,'14.21.0');
const stripe=new Stripe(key,{apiVersion:'2023-10-16',httpClient:Stripe.createFetchHttpClient(),maxNetworkRetries:1,timeout:30000});
const report={started_at:new Date().toISOString(),sdk:'14.21.0',api_version:'2023-10-16',mode:'isolated Stripe sandbox',checks:[],deliveries:[],limitations:[
  'Supabase transport is a SQL adapter to isolated PGlite; not deployed Edge gateway or production database.',
  'Checkout completion uses Stripe CLI official test fixtures, not an interactive browser.',
  'PGlite has one connection; PostgreSQL multi-connection race proof is separate.',
  'Property-data fulfillment and release controls remain held; successful billing receipt is not customer-ready property delivery.',
]};
const redact=value=>String(value).replace(/(?:sk|rk|rkcs|pk)_(?:test|live)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+/g,'[REDACTED]');
const log=(message,data={})=>console.log(JSON.stringify({message,...data}));
const save=()=>writeFileSync(process.env.SNAP_STRIPE_SANDBOX_REPORT,JSON.stringify(report,null,2)+'\n');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(label,fn,ms=70000) {const started=Date.now();let last;while(Date.now()-started<ms){try{const result=await fn();if(result)return result;}catch(e){last=e;}await sleep(500);}throw new Error(`timeout: ${label}${last?`: ${last.message}`:''}`);}
async function command(args) {
  return new Promise((resolve,reject)=>{
    const child=spawn(cli,args,{env:{...process.env,STRIPE_API_KEY:key},stdio:['ignore','pipe','pipe']});
    let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
    child.on('error',reject);child.on('exit',code=>code===0?resolve(output):reject(new Error(redact(`CLI ${args[0]} exited ${code}: ${output.slice(-2500)}`))));
  });
}
async function configuredDestinationPreflight() {
  // A test key does not prove isolation. Historical sandbox endpoints can forward
  // genuine test events to production services. Never modify or disable them here.
  const endpoints=await stripe.webhookEndpoints.list({limit:100}).autoPagingToArray({limit:10000});
  const destinations=[];
  let page='https://api.stripe.com/v2/core/event_destinations?include%5B0%5D=webhook_endpoint.url&limit=100';
  let pageCount=0;
  while(page) {
    assert.ok(++pageCount<=100,'event-destination pagination bound exceeded');
    const url=new URL(page,'https://api.stripe.com');assert.equal(url.origin,'https://api.stripe.com');
    // Current v2 metadata API is read-only. Billing requests retain API2023-10-16.
    const response=await fetch(url,{headers:{authorization:`Bearer ${key}`,'Stripe-Version':'2026-08-26.dahlia'},signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error(`event-destination preflight unavailable: HTTP ${response.status}; writes prohibited`);
    const data=await response.json();assert.ok(Array.isArray(data.data),'event-destination response incomplete');
    destinations.push(...data.data);page=data.next_page_url;
  }
  for(const destination of [...endpoints,...destinations])assert.equal(destination.livemode,false,'live destination in test preflight');
  const enabledV1=endpoints.filter(x=>x.status==='enabled').length;
  const enabledV2=destinations.filter(x=>x.status==='enabled').length;
  report.destination_preflight={complete:true,v1_count:endpoints.length,v2_count:destinations.length,enabled_v1:enabledV1,enabled_v2:enabledV2};save();
  assert.equal(enabledV1,0,'existing enabled webhook destination; isolation unproven and writes prohibited');
  assert.equal(enabledV2,0,'existing enabled event destination; isolation unproven and writes prohibited');
}
function moduleUrl(path,replacements={}) {
  let source=readFileSync(new URL(path,import.meta.url),'utf8');
  for(const [from,to]of Object.entries(replacements))source=source.replace(from,to);
  return 'data:text/javascript;base64,'+Buffer.from(ts.transpile(source,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022})).toString('base64');
}
const planUrl=moduleUrl('../supabase/functions/_shared/stripeSubscriptionPlan.ts');
const modeUrl=moduleUrl('../supabase/functions/_shared/stripeMode.ts');
const mode=await import(modeUrl);
const sync=await import(moduleUrl('../supabase/functions/_shared/billingSync.ts',{'./stripeSubscriptionPlan.ts':planUrl,'./stripeMode.ts':modeUrl}));
const productionHelpers={...sync,...mode};
const {db,client}=await database();
let webhookSecret,handler,listener,server;
let deliveryQueue=Promise.resolve();
const captures=[];
// Intentionally hold one authentic notification outside the handler to simulate
// delivery arriving for the first time after a later cancellation notification.
const deferredCreatedUsers=new Set();
const query=async(sql,args=[]) => (await db.query(sql,args)).rows;
const scalar=async(sql,args=[]) => Object.values((await query(sql,args))[0])[0];
const check=async(name,run)=>{log('check_start',{name});try{const evidence=await run();report.checks.push({name,result:'PASS',evidence:evidence??{}});log('check_pass',{name});}catch(e){report.checks.push({name,result:'FAIL',error:redact(e.message)});save();throw e;}save();};
async function dispatch(raw,signature,origin='stripe_cli_forward') {
  const event=JSON.parse(raw);
  assert.equal(event.livemode,false,'live events are never accepted by this harness');
  if(origin==='stripe_cli_forward'&&event.type==='customer.subscription.created'&&deferredCreatedUsers.has(event.data.object.metadata?.user_id)) {
    const capture={id:event.id,type:event.type,object_id:event.data.object.id,raw,signature,status:200,body:{harness_withheld:true}};
    captures.push(capture);report.deliveries.push({id:event.id,type:event.type,object_id:capture.object_id,status:'WITHHELD_IN_TEST_TRANSPORT'});save();return capture;
  }
  const response=await handler(new Request('http://127.0.0.1/webhook',{method:'POST',headers:{'stripe-signature':signature},body:raw}));
  const body=await response.json();
  const capture={id:event.id,type:event.type,object_id:event.data.object.id,raw,signature,status:response.status,body};
  captures.push(capture);
  report.deliveries.push({id:capture.id,type:capture.type,object_id:capture.object_id,status:capture.status,origin,body});
  save();return capture;
}
async function replay(capture) {return dispatch(capture.raw,capture.signature,'authentic_signed_event_local_replay');}
async function receive(type,objectId,predicate=()=>true) {
  return waitFor(`${type} for ${objectId}`,()=>captures.find(x=>x.type===type&&x.object_id===objectId&&predicate(x)));
}
async function newUser(){const id=randomUUID();await db.query('insert into auth.users(id) values($1)',[id]);return id;}
async function newCustomer(user,{clock=false}={}) {
  let clockObject;
  if(clock)clockObject=await stripe.testHelpers.testClocks.create({frozen_time:Math.floor(Date.now()/1000),name:'Snap isolated billing test'});
  const customer=await stripe.customers.create({name:'Snap synthetic test customer',metadata:{supabase_user_id:user},...(clockObject?{test_clock:clockObject.id}:{})});
  const paymentMethod=await stripe.paymentMethods.attach('pm_card_visa',{customer:customer.id});
  await stripe.customers.update(customer.id,{invoice_settings:{default_payment_method:paymentMethod.id}});
  return {customer,clock:clockObject};
}
async function advance(clock,frozenTime) {
  await stripe.testHelpers.testClocks.advance(clock.id,{frozen_time:frozenTime});
  await waitFor('test clock ready',async()=> (await stripe.testHelpers.testClocks.retrieve(clock.id)).status==='ready',90000);
}
async function completeCheckout(user,{kind='bulk_credits',asyncPayment=false,paymentConfiguration}={}) {
  const args=['trigger',asyncPayment?'checkout.session.async_payment_succeeded':'checkout.session.completed',
    '--add',`checkout_session:metadata.user_id=${user}`,'--add',`checkout_session:metadata.checkout_type=${kind}`,
    '--add','checkout_session:metadata.credit_count=5000','--override','price:unit_amount=37500',
    '--override','payment_page_confirm:expected_amount=75000'];
  if(asyncPayment)args.push('--remove','checkout_session:payment_method_types');
  if(paymentConfiguration)args.push('--add',`checkout_session:payment_method_configuration=${paymentConfiguration}`);
  await command(args);
  const session=await waitFor('new completed checkout session',async()=> (await stripe.checkout.sessions.list({limit:100})).data.find(x=>x.metadata?.user_id===user));
  return {session,event:await receive('checkout.session.completed',session.id)};
}
try {
  // Key prefix alone is insufficient: prove the authenticated account and all events are test-only.
  const account=await stripe.accounts.retrieve();
  assert.equal(account.id,expectedAccount,'authenticated Stripe account differs from explicitly approved sandbox');
  report.account_reference=createHash('sha256').update(account.id).digest('hex').slice(0,16);
  report.account_country=account.country;
  log('sandbox_authenticated',{account_reference:report.account_reference});
  await configuredDestinationPreflight();
  const source=readFileSync(new URL('../supabase/functions/stripe-webhook/index.ts',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');
  const env={SUPABASE_URL:'http://isolated-sql.invalid',SUPABASE_SERVICE_ROLE_KEY:'isolated-adapter-only',STRIPE_SECRET_KEY:key,STRIPE_EXPECTED_LIVEMODE:'false'};
  const deno={env:{get:name=>name==='STRIPE_WEBHOOK_SECRET'?webhookSecret:env[name]},serve:callback=>{handler=callback;}};
  new Function('Deno','createClient','Stripe',...Object.keys(productionHelpers),ts.transpile(source,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}))(deno,()=>client,Stripe,...Object.values(productionHelpers));
  server=createServer(async(req,res)=>{
    try{
      let raw='';for await(const chunk of req)raw+=chunk;
      const next=deliveryQueue.then(()=>dispatch(raw,String(req.headers['stripe-signature']??'')));
      deliveryQueue=next.catch(()=>{});const result=await next;
      res.writeHead(result.status,{'content-type':'application/json'});res.end(JSON.stringify(result.body));
    }catch(error){report.deliveries.push({status:500,harness_error:redact(error.message)});save();res.writeHead(500);res.end('harness failure');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let listenerOutput='';
  listener=spawn(cli,['listen','--skip-update','--events','checkout.session.completed,checkout.session.async_payment_succeeded,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_succeeded,invoice.payment_failed','--forward-to',`http://127.0.0.1:${server.address().port}/webhook`],{env:{...process.env,STRIPE_API_KEY:key},stdio:['ignore','pipe','pipe']});
  const output=buffer=>{listenerOutput+=buffer;const match=listenerOutput.match(/whsec_[A-Za-z0-9]+/);if(match)webhookSecret=match[0];};
  listener.stdout.on('data',output);listener.stderr.on('data',output);
  await waitFor('Stripe CLI signature-forwarding connection',()=>{if(listener.exitCode!==null)throw new Error(redact(listenerOutput));return webhookSecret;});
  log('listener_ready');
  await check('checkout release gate remains closed',async()=>{assert.equal(await scalar('select public.fn_billing_checkout_enabled_v1()'),false);});
  const product=await stripe.products.create({name:'Snap isolated Starter test'});
  const starter=await stripe.prices.create({product:product.id,currency:'usd',unit_amount:4900,recurring:{interval:'month'}});
  const professional=await stripe.prices.create({product:product.id,currency:'usd',unit_amount:9900,recurring:{interval:'month'}});
  const plan=randomUUID(),higherPlan=randomUUID();
  await db.query("insert into subscription_plans(id,name,max_monthly_exports,stripe_price_id,display_name) values($1,$2,$3,$4,'Sandbox Starter'),($5,$6,$7,$8,'Sandbox Professional')",[plan,'starter',750,starter.id,higherPlan,'professional',1500,professional.id]);
  let pack;
  await check('real completed Checkout grants exactly one purchased pack',async()=>{
    const user=await newUser();pack={user,...await completeCheckout(user)};
    assert.equal(pack.session.livemode,false);assert.equal(pack.event.status,200);assert.equal(pack.event.body.result.processed,true);
    assert.equal(await scalar('select sum(delta)::int from credit_ledger where user_id=$1',[user]),5000);
    assert.equal(await scalar('select count(*)::int from snap_billing.receipts where user_id=$1',[user]),1);
    return {session_id:pack.session.id,event_id:pack.event.id};
  });
  await check('authentic signed duplicate delivery does not grant twice',async()=>{
    const again=await replay(pack.event);assert.equal(again.status,200);assert.equal(again.body.result.duplicate,true);
    assert.equal(await scalar('select sum(delta)::int from credit_ledger where user_id=$1',[pack.user]),5000);
  });
  await check('invalid signature cannot modify receipts',async()=>{
    const before=await scalar('select count(*)::int from snap_billing.receipts');
    const response=await handler(new Request('http://127.0.0.1/webhook',{method:'POST',headers:{'stripe-signature':'t=1,v1=invalid'},body:pack.event.raw}));
    assert.equal(response.status,400);assert.equal(await scalar('select count(*)::int from snap_billing.receipts'),before);
  });
  await check('database failure returns retry; authentic replay commits atomically',async()=>{
    const user=await newUser();
    await db.exec(`CREATE FUNCTION sandbox_fail_ledger() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.user_id='${user}' THEN RAISE EXCEPTION 'sandbox_injected_failure'; END IF; RETURN NEW; END;$$; CREATE TRIGGER sandbox_fail BEFORE INSERT ON credit_ledger FOR EACH ROW EXECUTE FUNCTION sandbox_fail_ledger();`);
    const failed=await completeCheckout(user);assert.equal(failed.event.status,500);
    assert.equal(await scalar('select count(*)::int from transactions where user_id=$1',[user]),0);
    assert.equal(await scalar('select count(*)::int from snap_billing.events where event_id=$1',[failed.event.id]),0);
    await db.exec('DROP TRIGGER sandbox_fail ON credit_ledger');
    const retried=await replay(failed.event);assert.equal(retried.status,200);
    assert.equal(await scalar('select sum(delta)::int from credit_ledger where user_id=$1',[user]),5000);
    return {event_id:failed.event.id,initial_status:500,retry_status:200};
  });
  let recurring;
  await check('real initial subscription invoice establishes paid allowance without wallet deposit',async()=>{
    const user=await newUser(),owned=await newCustomer(user,{clock:true});
    deferredCreatedUsers.add(user);
    const subscription=await stripe.subscriptions.create({customer:owned.customer.id,items:[{price:starter.id}],metadata:{user_id:user},payment_behavior:'error_if_incomplete'});
    const event=await receive('invoice.paid',typeof subscription.latest_invoice==='string'?subscription.latest_invoice:subscription.latest_invoice.id,x=>x.status===200);
    recurring={user,...owned,subscription,createdEvent:await receive('customer.subscription.created',subscription.id,x=>x.status===200)};
    const row=(await query('select * from user_subscriptions where user_id=$1',[user]))[0];assert.equal(row.status,'active');assert.ok(row.paid_through);
    assert.equal(await scalar('select count(*)::int from credit_ledger where user_id=$1',[user]),0);
    return {subscription_id:subscription.id,event_id:event.id};
  });
  await check('real paid proration upgrade changes plan without duplicate allowance',async()=>{
    const updated=await stripe.subscriptions.update(recurring.subscription.id,{items:[{id:recurring.subscription.items.data[0].id,price:professional.id}],proration_behavior:'always_invoice',payment_behavior:'error_if_incomplete'});
    const invoiceId=typeof updated.latest_invoice==='string'?updated.latest_invoice:updated.latest_invoice.id;
    await receive('invoice.paid',invoiceId,x=>x.status===200);
    await waitFor('professional plan synchronized',async()=>await scalar('select plan_id from user_subscriptions where user_id=$1',[recurring.user])===higherPlan);
    assert.equal(await scalar('select count(*)::int from credit_ledger where user_id=$1',[recurring.user]),0);
    return {invoice_id:invoiceId};
  });
  await check('real clock renewal extends paid-through once and leaves wallet unchanged',async()=>{
    const before=await scalar('select current_period_end from user_subscriptions where user_id=$1',[recurring.user]);
    const current=await stripe.subscriptions.retrieve(recurring.subscription.id);
    await advance(recurring.clock,current.current_period_end+3600);
    let refreshed=await stripe.subscriptions.retrieve(current.id,{expand:['latest_invoice']});
    if(refreshed.latest_invoice.status==='draft')await stripe.invoices.finalizeInvoice(refreshed.latest_invoice.id);
    const invoice=await stripe.invoices.retrieve(refreshed.latest_invoice.id);
    if(invoice.status==='open')await stripe.invoices.pay(invoice.id);
    await receive('invoice.paid',invoice.id,x=>x.status===200);
    const after=await scalar('select current_period_end from user_subscriptions where user_id=$1',[recurring.user]);
    assert.ok(new Date(after)>new Date(before));assert.equal(await scalar('select count(*)::int from credit_ledger where user_id=$1',[recurring.user]),0);
    assert.equal(await scalar('select count(*)::int from snap_billing.receipts where receipt_key=$1',[`invoice:${invoice.id}`]),1);
    return {invoice_id:invoice.id,paid_through_before:before,paid_through_after:after};
  });
  await check('real cancellation and out-of-order signed event cannot resurrect access',async()=>{
    await stripe.subscriptions.cancel(recurring.subscription.id,{prorate:false,invoice_now:false});
    await receive('customer.subscription.deleted',recurring.subscription.id,x=>x.status===200);
    assert.equal(await scalar('select status from user_subscriptions where user_id=$1',[recurring.user]),'cancelled');
    assert.equal(await scalar('select count(*)::int from snap_billing.events where event_id=$1',[recurring.createdEvent.id]),0);
    const delayed=await replay(recurring.createdEvent);assert.equal(delayed.status,200);assert.equal(delayed.body.result.processed,true);
    assert.equal(await scalar('select status from user_subscriptions where user_id=$1',[recurring.user]),'cancelled');
  });
  await check('real trial conversion preserves usage and creates paid service period',async()=>{
    const user=await newUser(),owned=await newCustomer(user,{clock:true});
    const subscription=await stripe.subscriptions.create({customer:owned.customer.id,items:[{price:starter.id}],metadata:{user_id:user},trial_period_days:3});
    await receive('customer.subscription.created',subscription.id,x=>x.status===200);
    assert.equal(await scalar('select status from user_subscriptions where user_id=$1',[user]),'trialing');
    await db.query('update user_subscriptions set trial_exports_used=499 where user_id=$1',[user]);
    await advance(owned.clock,subscription.trial_end+3600);
    const converted=await stripe.subscriptions.retrieve(subscription.id,{expand:['latest_invoice']});
    if(converted.latest_invoice.status==='draft')await stripe.invoices.finalizeInvoice(converted.latest_invoice.id);
    const invoice=await stripe.invoices.retrieve(converted.latest_invoice.id);if(invoice.status==='open')await stripe.invoices.pay(invoice.id);
    await receive('invoice.paid',invoice.id,x=>x.status===200);
    const row=(await query('select * from user_subscriptions where user_id=$1',[user]))[0];assert.equal(row.status,'active');assert.equal(row.trial_exports_used,499);
    assert.equal(await scalar('select count(*)::int from credit_ledger where user_id=$1',[user]),0);
    return {subscription_id:subscription.id,invoice_id:invoice.id};
  });
  await check('real failed payment cannot establish paid subscription access',async()=>{
    const user=await newUser(),owned=await newCustomer(user);
    const bad=await stripe.paymentMethods.attach('pm_card_chargeCustomerFail',{customer:owned.customer.id});
    await stripe.customers.update(owned.customer.id,{invoice_settings:{default_payment_method:bad.id}});
    const subscription=await stripe.subscriptions.create({customer:owned.customer.id,items:[{price:starter.id}],metadata:{user_id:user},payment_behavior:'allow_incomplete'});
    const invoiceId=typeof subscription.latest_invoice==='string'?subscription.latest_invoice:subscription.latest_invoice.id;
    await receive('invoice.payment_failed',invoiceId,x=>x.status===200);
    const row=(await query('select * from user_subscriptions where user_id=$1',[user]))[0];assert.notEqual(row.status,'active');assert.equal(row.paid_through,null);
    assert.equal(await scalar('select count(*)::int from snap_billing.receipts where user_id=$1',[user]),0);
    return {subscription_id:subscription.id,provider_status:subscription.status,local_status:row.status};
  });
  await check('paid single-property test checkout retains fulfillment hold and retries',async()=>{
    const user=await newUser(),held=await completeCheckout(user,{kind:'single_unlock'});
    assert.equal(held.event.status,500);assert.equal(await scalar('select count(*)::int from snap_billing.receipts where user_id=$1',[user]),0);
    assert.equal(await scalar('select public.fn_billing_checkout_enabled_v1()'),false);
    return {session_id:held.session.id,note:'Negative test of a synthetic paid event. Real checkout was not enabled.'};
  });
  await check('real delayed checkout stays pending until async payment succeeds',async()=>{
    // Configure only this disposable sandbox. Dynamic payment methods remain enabled;
    // never pass the deprecated explicit payment_method_types allowlist.
    const configuration=await stripe.paymentMethodConfigurations.create({name:'Snap isolated asynchronous test',sepa_debit:{display_preference:{preference:'on'}}});
    const user=await newUser(),delayed=await completeCheckout(user,{asyncPayment:true,paymentConfiguration:configuration.id});
    assert.equal(delayed.event.status,200);assert.equal(delayed.event.body.pending,true,'need a genuinely unpaid canonical session at initial delivery to establish pending-branch coverage');
    const succeeded=await receive('checkout.session.async_payment_succeeded',delayed.session.id,x=>x.status===200);
    assert.equal(succeeded.body.result.processed,true);
    assert.equal(await scalar('select sum(delta)::int from credit_ledger where user_id=$1',[user]),5000);
    assert.equal(await scalar('select count(*)::int from snap_billing.receipts where user_id=$1',[user]),1);
    return {session_id:delayed.session.id,unpaid_event_id:delayed.event.id,paid_event_id:succeeded.id};
  });
  report.completed_at=new Date().toISOString();report.result='PASS';save();
} catch(error) {report.result='FAIL';report.error=redact(error.message);save();process.exitCode=1;log('sandbox_test_failed',{error:redact(error.message)});
} finally {listener?.kill('SIGTERM');if(server)await new Promise(resolve=>server.close(resolve));await deliveryQueue;await db.close();save();}
