import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTenancyDb,asRole,newUser,migration as tenancyMigration} from './helpers/tenancy-db.mjs';

const sqlFile=name=>readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8');
const id=n=>`33333333-3333-4333-8333-${String(n).padStart(12,'0')}`;
const quote=name=>`"${name.replaceAll('"','""')}"`;
function section(sql,start,end){
  const first=sql.indexOf(start),last=sql.indexOf(end,first);
  assert.ok(first>=0&&last>first,`Missing baseline section ${start}`);
  return sql.slice(first,last);
}

async function billingBaseline(db){
  // Restore columns/defaults/checks/FKs/indexes/policies from the checked-in native
  // schema snapshot. Do not weaken them to fit candidate writes. This is a local
  // fixture only; it executes no production query or snapshot deployment script.
  const captured=await readFile(new URL('../docs/reviewed-sql/20260915025000_held_current_subscription_and_county_access.sql',import.meta.url),'utf8');
  const snapshot=JSON.parse(captured.match(/\$expected\$([\s\S]*?)\$expected\$/)[1]);
  const tables=['subscription_plans','user_subscriptions'];
  for(const table of tables){
    const columns=snapshot.columns.filter(c=>c.table===table);
    assert.ok(columns.length>10,`Complete captured ${table} shape required`);
    await db.exec(`CREATE TABLE public.${quote(table)} (${columns.map(c=>`${quote(c.name)} ${c.type}${c.default===null?'':` DEFAULT ${c.default}`}${c.notnull?' NOT NULL':''}`).join(',')})`);
    for(const c of snapshot.constraints.filter(c=>c.table===table))
      await db.exec(`ALTER TABLE public.${quote(table)} ADD CONSTRAINT ${quote(c.name)} ${c.definition}`);
    const constraintNames=new Set(snapshot.constraints.filter(c=>c.table===table).map(c=>c.name));
    for(const index of snapshot.indexes.filter(i=>i.table===table&&!constraintNames.has(i.name)))await db.exec(index.definition);
    await db.exec(`ALTER TABLE public.${quote(table)} ENABLE ROW LEVEL SECURITY`);
    for(const p of snapshot.policies.filter(p=>p.table===table))
      await db.exec(`CREATE POLICY ${quote(p.name)} ON public.${quote(table)} FOR ${p.cmd} TO ${p.roles.map(quote).join(',')}${p.qual?` USING (${p.qual})`:''}${p.with_check?` WITH CHECK (${p.with_check})`:''}`);
  }
  const subscription=await sqlFile('20260118211721_a62363c9-7a61-42d0-afc1-4bfa616f34c2.sql');
  await db.exec(section(subscription,'CREATE OR REPLACE FUNCTION public.update_subscription_timestamp()','CREATE TRIGGER update_subscription_plans_timestamp'));
  for(const trigger of snapshot.triggers.filter(t=>tables.includes(t.table)))await db.exec(trigger.definition);
  const ledger=await sqlFile('20251006021041_52f662d2-70bb-4f35-b984-43426093d16b.sql');
  await db.exec(section(ledger,'CREATE TABLE IF NOT EXISTS public.credit_ledger','-- Atomic credit consumption function'));
  const ledgerColumns=await sqlFile('20251009014647_516002b4-6eb7-4ad1-9dcc-975db2f959fa.sql');
  await db.exec(section(ledgerColumns,'-- Add computed columns','-- Update fn_refund_credits'));
  await db.exec(await sqlFile('20260408162339_3da10f19-afc6-43f6-a599-d3e922404b33.sql'));
  const ledgerPermissions=await sqlFile('20260221044405_a5971aef-e77c-46dd-8d9d-dd891b7d2862.sql');
  await db.exec(section(ledgerPermissions,'-- Finding 23','-- Finding 24'));
  const debitGuard=await sqlFile('20260914204015_26d148c0-361c-4e10-b112-714c5abc4f4a.sql');
  await db.exec(section(debitGuard,'CREATE OR REPLACE FUNCTION public.guard_credit_ledger_debit_v1()','CREATE OR REPLACE FUNCTION public.fn_consume_credit'));
  const finance=await sqlFile('20260320005804_4e6a5669-9ced-485b-afee-07e721e0e4dd.sql');
  await db.exec(section(finance,'-- 5. Create transactions table','-- 8. Create notifications table'));
  await db.exec(await sqlFile('20260118215403_728b91ac-7f6f-4578-86b0-9ef32f92c097.sql'));
  // Match the captured public-table grants; RLS must still restrict customer writes.
  await db.exec(`GRANT ALL ON public.subscription_plans,public.user_subscriptions,public.credit_ledger,
    public.transactions,public.affiliate_referrals,public.affiliate_commissions TO anon,authenticated,service_role`);
}

test('all three release migrations interoperate with native billing shape, private CRM and persistent holds',async t=>{
  const db=await createTenancyDb({applyMigration:false});t.after(()=>db.close());
  await billingBaseline(db);
  const old=id(1),a=id(2),b=id(3),legacy=await newUser(db,old),property=id(10),held=id(11),oldProperty=id(12);
  await db.query("INSERT INTO public.properties(id,address) VALUES ($1,'Synthetic released property'),($2,'Synthetic held property'),($3,'Synthetic legacy property')",[property,held,oldProperty]);
  const oldStage=(await db.query('SELECT id FROM public.pipeline_stages WHERE org_id=$1 ORDER BY sort_order LIMIT 1',[legacy])).rows[0].id;
  await db.query("INSERT INTO public.leads(id,org_id,property_id,stage_id,created_by,next_follow_up_at,notes) VALUES ($1,$2,$3,$4,$5,'2030-01-05T12:00:00Z','Preserve legacy note')",[id(20),legacy,oldProperty,oldStage,old]);
  const migrations=[tenancyMigration,'20260924183006_snap_billing_atomic_fulfillment_v1.sql','20260924183021_snap_crm_workflow_v1.sql'];
  assert.deepEqual([...migrations].sort(),migrations);
  for(const migration of migrations)await db.exec(await sqlFile(migration));
  const oldLead=(await db.query('SELECT notes,next_action,next_follow_up_at FROM public.leads WHERE id=$1',[id(20)])).rows[0];
  assert.equal(oldLead.notes,'Preserve legacy note');assert.equal(oldLead.next_action,'Review saved follow-up');
  assert.equal(new Date(oldLead.next_follow_up_at).toISOString(),'2030-01-05T12:00:00.000Z');
  const orgA=await newUser(db,a),orgB=await newUser(db,b);assert.notEqual(orgA,orgB);
  const plan=id(30);
  await db.query("INSERT INTO public.subscription_plans(id,name,display_name,max_monthly_exports) VALUES ($1,'starter','Fixture starter',750)",[plan]);
  await db.query('INSERT INTO public.affiliate_referrals(referrer_id,referred_user_id) VALUES ($1,$2)',[b,a]);
  const apply=payload=>asRole(db,'service_role',null,()=>db.query('SELECT public.fn_apply_billing_event_v1($1) result',[JSON.stringify(payload)]));
  const pack={user_id:a,kind:'bulk_credits',session_id:'cs_integrated',payment_intent_id:'pi_integrated',amount:75000,currency:'usd',credits:5000};
  const first={event_id:'evt_integrated_pack',event_type:'fixture',payment:pack};
  await apply(first);await apply({...first,event_id:'evt_integrated_pack_retry'});
  const balance=async user=>(await db.query('SELECT coalesce(sum(delta),0)::int n FROM public.credit_ledger WHERE user_id=$1',[user])).rows[0].n;
  assert.equal(await balance(a),5000);assert.equal(await balance(b),0);
  assert.equal((await db.query('SELECT count(*)::int n FROM public.transactions')).rows[0].n,1);
  assert.equal((await db.query('SELECT count(*)::int n FROM public.affiliate_commissions')).rows[0].n,1);
  await asRole(db,'authenticated',a,async()=>{
    assert.equal((await db.query('SELECT user_id FROM public.transactions')).rows[0].user_id,a);
    await assert.rejects(()=>db.query("INSERT INTO public.credit_ledger(user_id,delta,reason) VALUES ($1,99999,'forged')",[a]),e=>e.code==='42501');
    await assert.rejects(()=>db.query('SELECT public.fn_apply_billing_event_v1($1)',[JSON.stringify(first)]),e=>e.code==='42501');
    // A paid wallet alone must not release held property data or bypass CRM entry guards.
    await assert.rejects(()=>db.query('SELECT public.fn_crm_add_property_v1($1)',[held]),e=>e.code==='42501');
  });
  assert.equal((await asRole(db,'service_role',null,()=>db.query('SELECT public.fn_billing_checkout_enabled_v1() enabled'))).rows[0].enabled,false);
  await db.query('INSERT INTO public.unlocked_properties(user_id,property_id) VALUES ($1,$2)',[a,property]);
  // Isolated fixture-only property authorization; the candidates never create this policy.
  await db.exec('CREATE POLICY fixture_one_released_property ON public.properties FOR SELECT TO authenticated USING (id IN (SELECT property_id FROM public.unlocked_properties WHERE user_id=auth.uid()))');
  let lead;
  await asRole(db,'authenticated',a,async()=>{
    lead=(await db.query('SELECT (public.fn_crm_add_property_v1($1)).*',[property])).rows[0];
    await db.query("INSERT INTO public.crm_contacts(lead_id,org_id,name,source) VALUES ($1,$2,'Synthetic owner','Manual fixture')",[lead.id,orgA]);
    lead=(await db.query("SELECT (public.fn_crm_record_outcome_v1($1,$2,$3,'research','Private research note','Review receipt','2030-01-06T12:00:00Z',false)).*",[lead.id,id(40),lead.updated_at])).rows[0];
    assert.equal(lead.next_action,'Review receipt');
  });
  const sub={user_id:a,subscription_id:'sub_integrated',customer_id:'cus_integrated',plan_id:plan,plan_name:'starter',stripe_status:'active',sync_version:1,observed_at:'2030-01-01T00:00:01Z',period_start:'2030-01-01T00:00:00Z',period_end:'2030-02-01T00:00:00Z',paid_through:'2030-02-01T00:00:00Z',paid_plan_verified:true};
  await apply({event_id:'evt_integrated_invoice',event_type:'fixture',subscription:sub,invoice:{invoice_id:'in_integrated',subscription_id:sub.subscription_id,user_id:a,amount:4900,currency:'usd',payment_intent_id:'pi_integrated_invoice'}});
  assert.equal(await balance(a),5000); // Subscription period allowance is not another wallet deposit.
  await apply({event_id:'evt_integrated_cancel',event_type:'fixture',subscription:{...sub,stripe_status:'canceled',sync_version:2}});
  await asRole(db,'authenticated',a,async()=>{
    assert.equal((await db.query('SELECT status FROM public.user_subscriptions')).rows[0].status,'cancelled');
    assert.equal((await db.query('SELECT next_action FROM public.leads WHERE id=$1',[lead.id])).rows[0].next_action,'Review receipt');
    assert.equal((await db.query('SELECT count(*)::int n FROM public.crm_contacts')).rows[0].n,1);
    await assert.rejects(()=>db.query('SELECT public.fn_crm_add_property_v1($1)',[held]),e=>e.code==='42501');
  });
  await asRole(db,'authenticated',b,async()=>{
    for(const table of ['leads','crm_contacts','transactions','user_subscriptions'])assert.equal((await db.query(`SELECT count(*)::int n FROM public.${table}`)).rows[0].n,0,table);
    await assert.rejects(()=>db.query("INSERT INTO public.crm_contacts(lead_id,org_id,name,source) VALUES ($1,$2,'Forged','Fixture')",[lead.id,orgB]),e=>e.code==='42501');
  });
});
