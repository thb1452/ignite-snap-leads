import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const sqlFile=name=>readFile(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8');
const quote=name=>`"${name.replaceAll('"','""')}"`;
function section(sql,start,end){
  const first=sql.indexOf(start),last=sql.indexOf(end,first);
  assert.ok(first>=0&&last>first,`Missing baseline section ${start}`);
  return sql.slice(first,last);
}

export async function billingBaseline(db){
  // Restore columns/defaults/checks/FKs/indexes/policies from the checked-in native
  // schema snapshot. Do not weaken them to fit candidate writes. This is a local
  // fixture only; it executes no production query or snapshot deployment script.
  const snapshot=JSON.parse(await readFile(new URL('../../scripts/tests/release-stage/native-catalog-20260924.json',import.meta.url),'utf8'));
  snapshot.policies=snapshot.policies.map(p=>({table:p.tablename,name:p.policyname,cmd:p.cmd,roles:p.roles,qual:p.qual,with_check:p.with_check}));
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
