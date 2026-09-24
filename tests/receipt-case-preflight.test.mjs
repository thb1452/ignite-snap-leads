import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createReceiptDb,root} from '../scripts/tests/release-hosted-source/fixture.mjs';

test('receipt staging deployment refuses altered source bodies, ACLs, policies, names and held baselines',async t=>{
 const db=await createReceiptDb({applyAdapter:false});t.after(()=>db.close());
 const sql=await readFile(new URL('scripts/tests/release-hosted-source/01_receipt_case_adapter.sql',root),'utf8');
 const scenarios=[
  ['function body drift',async()=>{
   const {rows}=await db.query("SELECT pg_get_functiondef('public.fn_is_source_property_v1(uuid)'::regprocedure) body");
   await db.exec(rows[0].body.replace('SELECT EXISTS','SELECT /* synthetic drift */ EXISTS'));
  },/Source fence baseline drift/],
  ['unexpected function grant',()=>db.exec('GRANT EXECUTE ON FUNCTION public.fn_source_lead_visible_v1(uuid,uuid) TO anon'),/Source fence baseline drift/],
  ['restrictive policy changed',()=>db.exec('ALTER POLICY source_property_account_fence_v1 ON public.properties USING(true) WITH CHECK(true)'),/Source fence baseline drift/],
  ['unreviewed RPC overload',()=>db.exec("CREATE FUNCTION public.fn_my_receipt_case_acceptances_v1(text) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$"),/RPC name already exists/],
  ['marker not ready',()=>db.exec("UPDATE public.snap_hosted_fixture SET state='baseline_only'"),/Ready staging fixture/],
  ['checkout window active',()=>db.exec("UPDATE snap_billing.release_controls SET checkout_enabled=true,fulfillment_verified_at=now(),approval_reference='Synthetic preflight test' WHERE singleton"),/checkout held/],
  ['legacy source fixtures nonempty',()=>db.exec("INSERT INTO snap_relaunch.customer_property_mappings(customer_property_id,created_for_source) VALUES(gen_random_uuid(),true)"),/Legacy staging source fixtures must be empty/],
 ];
 for(const [name,mutate,expected] of scenarios)await t.test(name,async()=>{
  await db.exec('BEGIN');
  try {await mutate();await assert.rejects(()=>db.exec(sql),expected);}
  finally {await db.exec('ROLLBACK');}
  assert.equal((await db.query("SELECT to_regnamespace('snap_receipt') IS NULL missing")).rows[0].missing,true);
 });
 await db.exec(sql);
 assert.equal((await db.query("SELECT count(*)::int count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='snap_receipt' AND c.relkind='r' AND NOT c.relrowsecurity")).rows[0].count,0);
 assert.equal((await db.query('SELECT public.fn_billing_checkout_enabled_v1() enabled')).rows[0].enabled,false);
});
