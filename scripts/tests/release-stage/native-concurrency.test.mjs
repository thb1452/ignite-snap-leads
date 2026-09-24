import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createTenancyDb,newUser} from '../../../tests/helpers/tenancy-db.mjs';
import {billingBaseline} from '../../../tests/helpers/billing-db.mjs';

// Only a dedicated local service container is accepted. Never point this bootstrap
// at the production database, an existing workspace, or the receipt-operations DB.
const connectionString=process.env.SNAP_STAGE_DATABASE_URL;
if(!connectionString)throw new Error('SNAP_STAGE_DATABASE_URL required: native PostgreSQL test NOT RUN');
const target=new URL(connectionString);
assert.ok(['127.0.0.1','localhost'].includes(target.hostname),'Dedicated local PostgreSQL required');
assert.equal(target.pathname,'/snap_release_stage','Dedicated synthetic staging database name required');
const require=createRequire(import.meta.url);
const {Client,types}=require('pg');
types.setTypeParser(1114,value=>value);
types.setTypeParser(1184,value=>value); // Preserve microseconds, as PostgREST JSON does.
const id=n=>`44444444-4444-4444-8444-${String(n).padStart(12,'0')}`;
const sqlFile=name=>readFile(new URL(`../../../supabase/migrations/${name}`,import.meta.url),'utf8');
const adapter=client=>({query:(...args)=>client.query(...args),exec:sql=>client.query(sql),close:()=>client.end()});
const evidence={kind:'native_postgresql_synthetic_concurrency',status:'RUNNING',hosted_supabase_verified:false,real_payment_verified:false,production_writes:0,checks:[]};

test('native PostgreSQL sessions serialize workspace, CRM and billing operations',async t=>{
  const clients=await Promise.all(Array.from({length:3},async()=>{const c=new Client({connectionString});await c.connect();await c.query("SET statement_timeout='15s'");return c;}));
  const [setup,first,second]=clients;
  t.after(async()=>{for(const c of clients)await c.query('ROLLBACK').catch(()=>{});await Promise.all(clients.map(c=>c.end()));});
  const db=adapter(setup);
  const {rows:[version]}=await setup.query("SELECT current_setting('server_version') version,current_setting('transaction_isolation') isolation,pg_backend_pid() pid");
  evidence.version=version.version;evidence.isolation=version.isolation;
  assert.match(version.version,/^17\.6(?:\D|$)/);
  const existing=(await setup.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')")).rows[0].n;
  assert.equal(existing,0,'Refusing bootstrap into non-empty database');
  await createTenancyDb({applyMigration:false,database:db});await billingBaseline(db);
  const legacyClean=id(1),legacyBusy=id(2);await newUser(db,legacyClean);const legacyOrg=await newUser(db,legacyBusy);
  const migrations=['20260924182954_snap_customer_workspace_isolation_v1.sql','20260924183006_snap_billing_atomic_fulfillment_v1.sql','20260924183021_snap_crm_workflow_v1.sql'];
  for(const file of migrations)await setup.query(await sqlFile(file));
  const account=id(3),other=id(4),org=await newUser(db,account);await newUser(db,other);
  const property=id(10),busyProperty=id(11),plan=id(12);
  await setup.query("INSERT INTO public.properties(id,address) VALUES ($1,'Synthetic race property'),($2,'Synthetic legacy race property')",[property,busyProperty]);
  await setup.query('INSERT INTO public.unlocked_properties(user_id,property_id) VALUES ($1,$2)',[account,property]);
  await setup.query('CREATE POLICY fixture_release ON public.properties FOR SELECT TO authenticated USING(id IN(SELECT property_id FROM public.unlocked_properties WHERE user_id=auth.uid()))');
  await setup.query("INSERT INTO public.subscription_plans(id,name,display_name,max_monthly_exports) VALUES ($1,'starter','Synthetic plan',750)",[plan]);
  const pids=await Promise.all(clients.map(async c=>(await c.query('SELECT pg_backend_pid() pid')).rows[0].pid));
  assert.equal(new Set(pids).size,3,'Tests require three independent native server sessions');
  evidence.distinct_backend_sessions=pids.length;

  async function begin(c,role,user){await c.query('BEGIN');await c.query(`SET LOCAL ROLE ${role}`);await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user??'']);}
  async function blockedByFirst(){
    for(let attempt=0;attempt<80;attempt++){
      const row=(await setup.query('SELECT pg_blocking_pids($1) blockers',[pids[2]])).rows[0];
      if(row.blockers.includes(pids[1]))return;
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    assert.fail('Second native session did not demonstrably wait for first session lock');
  }
  async function race({name,role='service_role',user=null,firstSql,firstArgs=[],secondSql=firstSql,secondArgs=firstArgs,after}){
    await begin(first,role,user);await begin(second,role,user);
    try{
      const initial=await first.query(firstSql,firstArgs);
      const waiting=second.query(secondSql,secondArgs).then(value=>({value}),error=>({error}));
      await blockedByFirst();await first.query('COMMIT');
      const later=await waiting;
      await second.query(later.error?'ROLLBACK':'COMMIT');
      await after(initial,later);
      evidence.checks.push({name,distinct_sessions:true,blocking_observed:true,result:'PASS'});
    }catch(error){await first.query('ROLLBACK');await second.query('ROLLBACK');throw error;}
  }
  await t.test('simultaneous reviewed provision creates one workspace',()=>race({
    name:'workspace_provision_replay',firstSql:'SELECT public.fn_provision_customer_workspace_v1($1,$2) result',firstArgs:[legacyClean,'native-concurrency-fixture'],
    after:async(a,b)=>{assert.ifError(b.error);assert.equal(a.rows[0].result.org_id,b.value.rows[0].result.org_id);assert.equal(b.value.rows[0].result.replayed,true);assert.equal((await setup.query('SELECT count(*)::int n FROM snap_security.workspace_owners WHERE user_id=$1',[legacyClean])).rows[0].n,1);}
  }));
  await t.test('racing legacy write cannot slip between provision preflight and ownership reassignment',async()=>{
    const stage=(await setup.query('SELECT id FROM public.pipeline_stages WHERE org_id=$1 ORDER BY sort_order LIMIT 1',[legacyOrg])).rows[0].id;
    await race({name:'workspace_writer_conflict',firstSql:'INSERT INTO public.leads(org_id,property_id,stage_id,created_by) VALUES($1,$2,$3,$4)',firstArgs:[legacyOrg,busyProperty,stage,legacyBusy],secondSql:'SELECT public.fn_provision_customer_workspace_v1($1,$2)',secondArgs:[legacyBusy,'native-concurrency-fixture'],after:async(_a,b)=>{assert.match(b.error?.message??'',/owned_rows_need_review/);assert.equal((await setup.query('SELECT org_id FROM public.profiles WHERE user_id=$1',[legacyBusy])).rows[0].org_id,legacyOrg);}});
  });
  let lead;
  await t.test('same-property handoff has one lead and creation event',()=>race({
    name:'crm_handoff_replay',role:'authenticated',user:account,firstSql:'SELECT * FROM public.fn_crm_add_property_v1($1)',firstArgs:[property],
    after:async(a,b)=>{assert.ifError(b.error);lead=a.rows[0];assert.equal(lead.id,b.value.rows[0].id);assert.equal((await setup.query('SELECT count(*)::int n FROM public.leads WHERE org_id=$1 AND property_id=$2',[org,property])).rows[0].n,1);assert.equal((await setup.query('SELECT count(*)::int n FROM public.lead_activities WHERE lead_id=$1',[lead.id])).rows[0].n,1);}
  }));
  const outcomeSql="SELECT * FROM public.fn_crm_record_outcome_v1($1,$2,$3,'research','Synthetic work','Review source','2030-02-01T00:00:00Z',false)";
  await t.test('identical simultaneous outcome requests append once',()=>race({
    name:'crm_outcome_replay',role:'authenticated',user:account,firstSql:outcomeSql,firstArgs:[lead.id,id(20),lead.updated_at],
    after:async(a,b)=>{assert.ifError(b.error);lead=a.rows[0];assert.equal((await setup.query('SELECT count(*)::int n FROM public.lead_activities WHERE id=$1',[id(20)])).rows[0].n,1);}
  }));
  await t.test('competing outcome with stale version fails without a second event',()=>race({
    name:'crm_outcome_conflict',role:'authenticated',user:account,firstSql:outcomeSql,firstArgs:[lead.id,id(21),lead.updated_at],secondArgs:[lead.id,id(22),lead.updated_at],
    after:async(a,b)=>{assert.equal(b.error?.code,'40001');lead=a.rows[0];assert.equal((await setup.query('SELECT count(*)::int n FROM public.lead_activities WHERE id=$1',[id(22)])).rows[0].n,0);}
  }));
  const billingSql='SELECT public.fn_apply_billing_event_v1($1) result';
  const pack={user_id:account,kind:'bulk_credits',session_id:'cs_native_race',payment_intent_id:'pi_native_race',amount:75000,currency:'usd',credits:5000};
  await t.test('different webhook identities for same purchase fulfill once',()=>race({
    name:'billing_receipt_replay',firstSql:billingSql,firstArgs:[JSON.stringify({event_id:'evt_race_a',event_type:'fixture',payment:pack})],secondArgs:[JSON.stringify({event_id:'evt_race_b',event_type:'fixture',payment:pack})],
    after:async(_a,b)=>{assert.ifError(b.error);assert.equal(b.value.rows[0].result.duplicate_receipt,true);assert.equal((await setup.query('SELECT sum(delta)::int n FROM public.credit_ledger WHERE user_id=$1',[account])).rows[0].n,5000);assert.equal((await setup.query('SELECT count(*)::int n FROM public.transactions')).rows[0].n,1);}
  }));
  const snapshot={user_id:account,subscription_id:'sub_native_race',customer_id:'cus_native_race',plan_id:plan,plan_name:'starter',stripe_status:'active',sync_version:3,observed_at:'2030-01-01T00:00:00Z',period_start:'2030-01-01T00:00:00Z',period_end:'2030-02-01T00:00:00Z',paid_through:'2030-02-01T00:00:00Z',paid_plan_verified:true};
  await t.test('terminal cancellation wins under overlapping reordered billing snapshots',()=>race({
    name:'billing_terminal_order',firstSql:billingSql,firstArgs:[JSON.stringify({event_id:'evt_active_ticket3',event_type:'fixture',subscription:snapshot})],secondArgs:[JSON.stringify({event_id:'evt_cancel_ticket2',event_type:'fixture',subscription:{...snapshot,stripe_status:'canceled',sync_version:2}})],
    after:async(_a,b)=>{assert.ifError(b.error);await setup.query(billingSql,[JSON.stringify({event_id:'evt_stale_active_ticket4',event_type:'fixture',subscription:{...snapshot,sync_version:4}})]);assert.equal((await setup.query('SELECT status FROM public.user_subscriptions WHERE user_id=$1',[account])).rows[0].status,'cancelled');}
  }));
  evidence.status=evidence.checks.length===7?'PASS':'FAIL';
  await writeFile(process.env.SNAP_STAGE_RECEIPT??'native-stage-receipt.json',JSON.stringify(evidence,null,2)+'\n');
  assert.equal(evidence.status,'PASS');
});
