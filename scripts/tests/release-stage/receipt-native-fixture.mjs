/** Synthetic-only fixture shared by native CI and its offline bootstrap check. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createTenancyDb} from '../../../tests/helpers/tenancy-db.mjs';

export const receiptSqlSha256='34d24dfb960420be6465f086266e4086571933e8d030e7236b8d59b14df55a6f';
const root=new URL('../../../',import.meta.url);

export function requireReceiptDatabase(value) {
  assert.ok(typeof value==='string'&&value.length>0,'SNAP_RECEIPT_DATABASE_URL required: native receipt test NOT RUN');
  let target;
  try {target=new URL(value);} catch {throw new Error('Invalid synthetic PostgreSQL connection');}
  assert.ok(['postgres:','postgresql:'].includes(target.protocol),'PostgreSQL protocol required');
  assert.ok(['127.0.0.1','localhost'].includes(target.hostname),'Only a dedicated loopback PostgreSQL service is allowed');
  assert.ok(target.pathname==='/snap_receipt_stage','Dedicated snap_receipt_stage database required');
  assert.ok(target.username==='postgres'&&(!target.port||target.port==='5432'),'Dedicated local CI role and port required');
  assert.ok(!target.search&&!target.hash,'Connection overrides are not allowed');
  return value;
}

export async function bootstrapReceiptDatabase(db) {
  const existing=(await db.query(`SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')`)).rows[0].n;
  assert.equal(existing,0,'Refusing to bootstrap a nonempty database');
  assert.equal((await db.query("SELECT to_regnamespace('auth') IS NULL AND to_regnamespace('snap_receipt') IS NULL AS blank")).rows[0].blank,true,'Fresh local synthetic namespaces required');
  // These Auth doubles belong only to an empty local test database. The actual
  // hosted baseline below does not create or replace managed Supabase Auth.
  let managed;
  await createTenancyDb({applyMigration:false,database:{exec:async sql=>{
    if(sql.trimStart().startsWith('CREATE ROLE anon NOLOGIN;'))managed=sql.slice(0,sql.indexOf('CREATE TYPE public.app_role'));
  }}});
  assert.ok(managed,'Known local Auth test bootstrap required');
  const sql=await readFile(new URL('scripts/tests/release-hosted-source/01_receipt_case_adapter.sql',root),'utf8');
  assert.equal(createHash('sha256').update(sql).digest('hex'),receiptSqlSha256,'Receipt SQL changed: review the native test contract before updating its frozen fingerprint');
  await db.exec(managed);
  await db.exec('CREATE TABLE auth.identities(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id))');
  const manifest=JSON.parse(await readFile(new URL('scripts/tests/release-hosted/manifest.json',root),'utf8'));
  assert.equal(manifest.apply_order.length,8,'Reviewed hosted baseline order changed');
  for(const file of manifest.apply_order)await db.exec(await readFile(new URL(file,root),'utf8'));
  await db.exec(sql);
  assert.equal((await db.query('SELECT public.fn_billing_checkout_enabled_v1() enabled')).rows[0].enabled,false);
}
