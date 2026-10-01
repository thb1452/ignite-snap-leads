import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createTenancyDb} from '../../../tests/helpers/tenancy-db.mjs';
import {billingBaseline} from '../../../tests/helpers/billing-db.mjs';
import {connect,workdir} from './runtime.mjs';

const client=await connect();
try{
  const found=(await client.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','snap_security','snap_relaunch','snap_billing') AND c.relkind IN ('r','p')")).rows[0].n;
  assert.equal(found,0,'Refusing existing application schema');
  assert.equal((await client.query('SELECT count(*)::int n FROM auth.users')).rows[0].n,0,'Refusing existing Auth accounts');
  const managedSnapshot=async()=>JSON.stringify((await client.query(`
    SELECT 'function' kind,p.oid::regprocedure::text name,pg_get_functiondef(p.oid) definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='auth'
    UNION ALL SELECT 'column',a.attname,format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull||':'||coalesce(pg_get_expr(d.adbin,d.adrelid),'')
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='auth.users'::regclass AND a.attnum>0 AND NOT a.attisdropped
    UNION ALL SELECT 'constraint',conname,pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='auth.users'::regclass
    ORDER BY kind,name
  `)).rows);
  const before=await managedSnapshot();
  assert.ok(before.includes('auth.uid()')&&before.includes('auth.jwt()'),'Managed Auth functions required');
  let removedManagedBootstrap=0;
  const db={query:(...args)=>client.query(...args),exec:async sql=>{
    if(sql.trimStart().startsWith('CREATE ROLE anon NOLOGIN;')){
      assert.equal(removedManagedBootstrap++,0,'Only one fixture-managed bootstrap permitted');
      const boundary=sql.indexOf('CREATE TYPE public.app_role');assert.ok(boundary>0);
      const prefix=sql.slice(0,boundary);
      for(const marker of ['CREATE SCHEMA auth;','CREATE TABLE auth.users(','CREATE FUNCTION auth.uid()','CREATE FUNCTION auth.jwt()'])assert.ok(prefix.includes(marker),'Fixture bootstrap changed');
      // Match the exact fixture prefix so future changes cannot silently disappear.
      assert.equal(createHash('sha256').update(prefix).digest('hex'),'d677213398ffd082790bca183d37491595c2286e8ee35170f45f7379e45d0aea');
      sql=sql.slice(boundary);
    }
    assert.doesNotMatch(sql,/\b(?:CREATE|DROP)\s+(?:OR\s+REPLACE\s+)?(?:ROLE\b|SCHEMA\s+auth\b|TABLE\s+auth\.|FUNCTION\s+auth\.)/i,'Managed Auth replacement forbidden');
    return client.query(sql);
  }};
  await createTenancyDb({applyMigration:false,database:db});await billingBaseline(db);
  const migrations=['20260924182954_snap_customer_workspace_isolation_v1.sql','20260924183006_snap_billing_atomic_fulfillment_v1.sql','20260924183021_snap_crm_workflow_v1.sql','20260924214048_snap_crm_outcome_conflict_v1.sql'];
  for(const name of migrations)await db.exec(await readFile(new URL(`../../../supabase/migrations/${name}`,import.meta.url),'utf8'));
  assert.equal(removedManagedBootstrap,1);assert.equal(await managedSnapshot(),before,'Managed Auth definitions changed');
  // Synthetic ordinary-property visibility only. Preserve the real held/source
  // restrictive fences. This explicitly does NOT validate municipal lineage.
  await client.query('CREATE POLICY fixture_local_released_property ON public.properties FOR SELECT TO authenticated USING(id IN (SELECT property_id FROM public.unlocked_properties WHERE user_id=auth.uid()))');
  await client.query("NOTIFY pgrst,'reload schema'");
  await writeFile(`${workdir}/bootstrap-receipt.json`,JSON.stringify({managed_auth_preserved:true,candidate_migrations:migrations,source_lineage_fixture:true,hosted_supabase_verified:false})+'\n');
  console.log('Synthetic application fixture and candidate migrations applied; managed Auth preserved.');
}finally{await client.end();}
