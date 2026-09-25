import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const sql = readFileSync(new URL('../../supabase/migrations/20260924183006_snap_billing_atomic_fulfillment_v1.sql', import.meta.url), 'utf8');
const user = '00000000-0000-4000-8000-000000000001';
const plan = '00000000-0000-4000-8000-000000000002';
const bootstrap = `
SET TIME ZONE 'UTC';
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key);
CREATE TABLE public.subscription_plans(id uuid primary key,name text,max_monthly_exports integer);
CREATE TABLE public.user_subscriptions(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users,
plan_id uuid not null references subscription_plans, status text not null CHECK(status in ('active','past_due','cancelled','unpaid','trialing')),
stripe_customer_id text, stripe_subscription_id text, current_period_start timestamptz,current_period_end timestamptz,
trial_started_at timestamptz,trial_ends_at timestamptz,trial_tier text,trial_exports_used integer default 0,trial_exports_limit integer default 500,
cancel_at timestamptz,cancelled_at timestamptz);
CREATE UNIQUE INDEX one_current ON public.user_subscriptions(user_id) WHERE status<>'cancelled';
CREATE TABLE public.webhook_events(event_id text primary key);
CREATE TABLE public.transactions(id uuid primary key default gen_random_uuid(),user_id uuid,stripe_payment_intent_id text unique,amount integer,currency text default 'usd',description text,status text,metadata jsonb);
CREATE TABLE public.credit_ledger(id uuid primary key default gen_random_uuid(),user_id uuid,delta integer,reason text,meta jsonb);
CREATE UNIQUE INDEX idx_credit_ledger_unique_session ON public.credit_ledger((meta->>'stripe_session_id')) WHERE meta->>'stripe_session_id' IS NOT NULL;
CREATE TABLE public.affiliate_referrals(id uuid primary key default gen_random_uuid(),referred_user_id uuid,signup_at timestamptz,first_purchase_at timestamptz);
CREATE TABLE public.affiliate_commissions(id uuid primary key default gen_random_uuid(),referral_id uuid,transaction_id uuid,amount integer,commission_rate integer,status text);
INSERT INTO auth.users VALUES('${user}'); INSERT INTO public.subscription_plans VALUES('${plan}','starter',750);
`;
async function fixture() {const db=new PGlite();await db.exec(bootstrap);await db.exec(sql);return db;}
function subscription(extra={}) {return {user_id:user,subscription_id:'sub_test',customer_id:'cus_test',plan_id:plan,plan_name:'starter',stripe_status:'active',observed_at:'2030-01-01T00:00:01Z',sync_version:1,period_start:'2030-01-01T00:00:00Z',period_end:'2030-02-01T00:00:00Z',paid_through:'2030-02-01T00:00:00Z',...extra};}
const event=(id,extra={})=>({event_id:id,event_type:'test',...extra});
async function apply(db,payload) {return (await db.query('select public.fn_apply_billing_event_v1($1::jsonb) as result',[JSON.stringify(payload)])).rows[0].result;}
async function scalar(db,q) {return Object.values((await db.query(q)).rows[0])[0];}
const payment=(extra={})=>({user_id:user,kind:'bulk_credits',session_id:'cs_test',payment_intent_id:'pi_test',amount:75000,currency:'usd',credits:5000,...extra});

test('checkout defaults closed and only service role can call billing RPC',async()=>{const db=await fixture();try{
assert.equal(await scalar(db,'select public.fn_billing_checkout_enabled_v1()'),false);
assert.equal(await scalar(db,`select has_function_privilege('authenticated','public.fn_apply_billing_event_v1(jsonb)','execute')`),false);
assert.equal(await scalar(db,`select has_function_privilege('anon','public.fn_billing_checkout_enabled_v1()','execute')`),false);
await db.exec('SET ROLE authenticated');await assert.rejects(()=>apply(db,event('evt_unauthorized',{payment:payment()})),/permission denied/);
}finally{await db.close();}});

test('replayed and concurrently submitted pack notifications add once',async()=>{const db=await fixture();try{
await Promise.all(Array.from({length:10},(_,i)=>apply(db,event(`evt_${i}`,{payment:payment()}))));
assert.equal(await scalar(db,'select sum(delta)::integer from credit_ledger'),5000);
assert.equal(await scalar(db,'select count(*)::integer from transactions'),1);
assert.equal(await scalar(db,'select count(*)::integer from snap_billing.receipts'),1);
assert.equal((await apply(db,event('evt_0',{payment:payment()}))).duplicate,true);
}finally{await db.close();}});

test('subscription renewal records unique invoice without duplicating period quota in wallet',async()=>{const db=await fixture();try{
await db.exec(`INSERT INTO credit_ledger(user_id,delta,reason) VALUES('${user}',123,'historical_paid_pack')`);
for(const id of ['evt_paid','evt_paid_other']) await apply(db,event(id,{subscription:subscription(),invoice:{invoice_id:'in_test',user_id:user,subscription_id:'sub_test',amount:4900,currency:'usd',payment_intent_id:'pi_invoice'}}));
assert.equal(await scalar(db,'select sum(delta)::integer from credit_ledger'),123);
assert.equal(await scalar(db,'select count(*)::integer from user_subscriptions'),1);
assert.equal(await scalar(db,'select count(*)::integer from snap_billing.receipts'),1);
}finally{await db.close();}});

test('trial verification preserves consumed allowance and original start',async()=>{const db=await fixture();try{
await apply(db,event('evt_trial',{subscription:subscription({stripe_status:'trialing',trial_start:'2030-01-01T00:00:00Z',trial_end:'2030-01-04T00:00:00Z',paid_through:null})}));
await db.exec('UPDATE user_subscriptions SET trial_exports_used=499,trial_exports_limit=500');
await apply(db,event('evt_verify',{subscription:subscription({stripe_status:'trialing',observed_at:'2030-01-02T00:00:00Z',sync_version:2,trial_start:'2030-01-02T00:00:00Z',trial_end:'2030-01-04T00:00:00Z',paid_through:null})}));
assert.equal(await scalar(db,'select trial_exports_used from user_subscriptions'),499);
assert.equal(await scalar(db,"select to_char(trial_started_at,'YYYY-MM-DD') from user_subscriptions"),'2030-01-01');
}finally{await db.close();}});

test('out of order older snapshot cannot resurrect canceled subscription',async()=>{const db=await fixture();try{
await apply(db,event('evt_deleted',{subscription:subscription({stripe_status:'canceled',observed_at:'2030-01-03T00:00:00Z',sync_version:3})}));
await apply(db,event('evt_old_created',{subscription:subscription()}));
assert.equal(await scalar(db,'select status from user_subscriptions'),'cancelled');
}finally{await db.close();}});

test('subscription created before checkout is one record and errors do not cancel another subscription',async()=>{const db=await fixture();try{
await apply(db,event('evt_created',{subscription:subscription()}));
await apply(db,event('evt_checkout',{subscription:subscription({observed_at:'2030-01-02T00:00:00Z',sync_version:2})}));
await assert.rejects(()=>apply(db,event('evt_conflict',{subscription:subscription({subscription_id:'sub_other'})})),/billing_multiple_subscriptions_review/);
assert.equal(await scalar(db,'select count(*)::integer from user_subscriptions'),1);
assert.equal(await scalar(db,'select status from user_subscriptions'),'active');
assert.equal(await scalar(db,"select count(*)::integer from snap_billing.events where event_id='evt_conflict'"),0);
}finally{await db.close();}});

test('injected fulfillment failure rolls subscription, receipt, transaction and event back; retry succeeds',async()=>{const db=await fixture();try{
await db.exec(`CREATE FUNCTION fail_ledger() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected_ledger_failure'; END;$$; CREATE TRIGGER fail BEFORE INSERT ON credit_ledger FOR EACH ROW EXECUTE FUNCTION fail_ledger();`);
const payload=event('evt_failure',{subscription:subscription(),payment:payment()});
await assert.rejects(()=>apply(db,payload),/injected_ledger_failure/);
for(const table of ['user_subscriptions','transactions','snap_billing.receipts','snap_billing.events']) assert.equal(await scalar(db,`select count(*)::integer from ${table}`),0);
await db.exec('DROP TRIGGER fail ON credit_ledger');await apply(db,payload);
assert.equal(await scalar(db,'select sum(delta)::integer from credit_ledger'),5000);
}finally{await db.close();}});

test('unpaid future renewal cannot extend paid-through access',async()=>{const db=await fixture();try{
await apply(db,event('evt_paid',{subscription:subscription()}));
await apply(db,event('evt_future',{subscription:subscription({observed_at:'2030-01-03T00:00:00Z',sync_version:3,period_end:'2030-03-01T00:00:00Z',paid_through:null})}));
assert.equal(await scalar(db,"select to_char(current_period_end,'YYYY-MM-DD') from user_subscriptions"),'2030-02-01');
}finally{await db.close();}});

test('no paid invoice cannot activate subscription; zero-dollar paid invoice can establish a real period',async()=>{const db=await fixture();try{
await apply(db,event('evt_unpaid',{subscription:subscription({paid_through:null})}));
assert.equal(await scalar(db,'select status from user_subscriptions'),'unpaid');
await apply(db,event('evt_zero',{subscription:subscription({observed_at:'2030-01-02T00:00:00Z',sync_version:2}),invoice:{invoice_id:'in_zero',user_id:user,amount:0,currency:'usd'}}));
assert.equal(await scalar(db,'select status from user_subscriptions'),'active');
assert.equal(await scalar(db,'select count(*)::integer from credit_ledger'),0);
}finally{await db.close();}});

test('already recorded legacy event and pack are preserved without regrant',async()=>{const db=await fixture();try{
await db.exec("INSERT INTO webhook_events VALUES('evt_legacy')");
assert.equal((await apply(db,event('evt_legacy',{payment:payment()}))).duplicate,true);
await db.exec(`INSERT INTO credit_ledger(user_id,delta,reason,meta) VALUES('${user}',5000,'credit_pack_purchase','{"stripe_session_id":"cs_test"}')`);
await apply(db,event('evt_new',{payment:payment()}));
assert.equal(await scalar(db,'select sum(delta)::integer from credit_ledger'),5000);
}finally{await db.close();}});

test('single unlock cannot bypass privacy hold and remains retryable',async()=>{const db=await fixture();try{
await assert.rejects(()=>apply(db,event('evt_unlock',{payment:payment({kind:'single_unlock'})})),/customer_access_held/);
assert.equal(await scalar(db,'select count(*)::integer from snap_billing.events'),0);
}finally{await db.close();}});

test('affiliate receipt emitted once across duplicate session IDs',async()=>{const db=await fixture();try{
await db.exec(`INSERT INTO affiliate_referrals(referred_user_id,signup_at) VALUES('${user}',now())`);
await apply(db,event('evt_a',{payment:payment()}));await apply(db,event('evt_b',{payment:payment()}));
assert.equal(await scalar(db,'select count(*)::integer from affiliate_commissions'),1);
assert.equal(await scalar(db,'select amount from affiliate_commissions'),22500);
}finally{await db.close();}});

test('migration rejects duplicate historical subscription identities without deleting data',async()=>{const db=new PGlite();try{
await db.exec(bootstrap);
await db.exec(`INSERT INTO user_subscriptions(user_id,plan_id,status,stripe_subscription_id) VALUES('${user}','${plan}','cancelled','sub_dupe'),('${user}','${plan}','cancelled','sub_dupe')`);
await assert.rejects(()=>db.exec(sql),/billing_duplicate_subscription_ids/);await db.exec('ROLLBACK');
assert.equal(await scalar(db,'select count(*)::integer from user_subscriptions'),2);
}finally{await db.close();}});

test('unpaid active upgrade cannot borrow old paid-through to grant a higher plan',async()=>{const db=await fixture();try{
const higher='00000000-0000-4000-8000-000000000003';
await db.exec(`INSERT INTO subscription_plans VALUES('${higher}','professional',1500)`);
await apply(db,event('evt_original',{subscription:subscription()}));
await assert.rejects(()=>apply(db,event('evt_unpaid_upgrade',{subscription:subscription({plan_id:higher,plan_name:'professional',sync_version:2,paid_through:null,paid_plan_verified:false})})),/billing_plan_change_unpaid/);
assert.equal(await scalar(db,'select plan_id from user_subscriptions'),plan);
assert.equal(await scalar(db,"select count(*)::integer from snap_billing.events where event_id='evt_unpaid_upgrade'"),0);
await apply(db,event('evt_paid_upgrade',{subscription:subscription({plan_id:higher,plan_name:'professional',sync_version:3,paid_through:null,paid_plan_verified:true})}));
assert.equal(await scalar(db,'select plan_id from user_subscriptions'),higher);
assert.equal(await scalar(db,'select count(*)::integer from credit_ledger'),0);
}finally{await db.close();}});

test('terminal provider cancellation wins even when fetched with an earlier ticket',async()=>{const db=await fixture();try{
await apply(db,event('evt_active_new_ticket',{subscription:subscription({sync_version:3})}));
await apply(db,event('evt_delayed_cancel',{subscription:subscription({stripe_status:'canceled',sync_version:2})}));
assert.equal(await scalar(db,'select status from user_subscriptions'),'cancelled');
await apply(db,event('evt_active_stale_provider',{subscription:subscription({sync_version:4})}));
assert.equal(await scalar(db,'select status from user_subscriptions'),'cancelled');
}finally{await db.close();}});

test('a pending account closure prevents new purchases without deleting customer data',async()=>{const db=await fixture();try{
assert.equal(await scalar(db,`select public.fn_billing_account_open_v1('${user}')`),true);
await db.query('select public.fn_record_account_closure_v1($1::uuid,$2)',[user,'pending_retention_review']);
assert.equal(await scalar(db,`select public.fn_billing_account_open_v1('${user}')`),false);
assert.equal(await scalar(db,'select count(*)::integer from auth.users'),1);
}finally{await db.close();}});
