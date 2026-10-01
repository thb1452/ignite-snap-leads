import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {requireReceiptDatabase,bootstrapReceiptDatabase} from './receipt-native-fixture.mjs';

test('native receipt target validation rejects remote, wrong database and connection overrides before connecting',()=>{
  const local='postgresql://postgres:synthetic-ci-only@127.0.0.1:5432/snap_receipt_stage';
  assert.equal(requireReceiptDatabase(local),local);
  for(const value of [undefined,'not a URL',local.replace('127.0.0.1','example.invalid'),
    local.replace('snap_receipt_stage','postgres'),local.replace(':5432',':5433'),
    local+'?options=-c%20search_path=public',local+'#fragment',local.replace('postgresql:','https:')]) {
    assert.throws(()=>requireReceiptDatabase(value));
  }
});

test('native receipt bootstrap applies exact reviewed SQL locally and refuses a populated database',async()=>{
  const db=new PGlite();
  try {
    await bootstrapReceiptDatabase(db);
    assert.equal((await db.query("SELECT count(*)::int n FROM snap_receipt.acceptances")).rows[0].n,0);
    assert.equal((await db.query("SELECT count(*)::int n FROM auth.users")).rows[0].n,0);
    await assert.rejects(()=>bootstrapReceiptDatabase(db),/nonempty database/);
  } finally {await db.close();}
});
