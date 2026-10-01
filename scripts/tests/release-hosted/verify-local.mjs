/** In-memory SQL/permission verification. No network, credentials or hosted claims. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createTenancyDb,asRole,newUser} from '../../../tests/helpers/tenancy-db.mjs';

const here=new URL('./',import.meta.url),root=new URL('../../../',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',here),'utf8'));
const db=new PGlite();
try{
  // The pre-existing PGlite test double is confined to this in-memory verifier.
  // The generated hosted SQL never creates/replaces managed roles or Auth objects.
  let managed;
  await createTenancyDb({applyMigration:false,database:{exec:async sql=>{
    if(sql.trimStart().startsWith('CREATE ROLE anon NOLOGIN;'))managed=sql.slice(0,sql.indexOf('CREATE TYPE public.app_role'));
  }}});
  assert.ok(managed);await db.exec(managed);
  await db.exec('CREATE TABLE auth.identities(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id))');
  for(const path of manifest.bootstrap_apply_order)await db.exec(await readFile(new URL(path,root),'utf8'));
  const applicationFunctions=async()=> (await db.query(`SELECT p.oid,n.nspname,p.proname,p.proconfig,to_jsonb(p)-'proconfig' AS unchanged_definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('public','snap_relaunch','snap_security','snap_billing') ORDER BY p.oid`)).rows;
  const functionsBefore=await applicationFunctions();
  await db.exec(await readFile(new URL('05_function_search_paths.sql',here),'utf8'));
  const functionsAfter=await applicationFunctions();assert.equal(functionsBefore.length,functionsAfter.length);
  let fixedPaths=0;
  for(let i=0;i<functionsBefore.length;i++){
    const before=functionsBefore[i],after=functionsAfter[i];
    assert.deepEqual(after.unchanged_definition,before.unchanged_definition,'Function body/owner/grant changed');
    if(['public.tg_set_updated_at','snap_relaunch.require_source_acceptance_v1'].includes(`${after.nspname}.${after.proname}`)){
      assert.deepEqual(after.proconfig,['search_path=pg_catalog']);fixedPaths++;
    }else assert.deepEqual(after.proconfig,before.proconfig,'An unrelated function setting changed');
  }
  assert.equal(fixedPaths,2);
  await db.exec(await readFile(new URL('06_self_scoped_role_check.sql',here),'utf8'));
  assert.equal(manifest.additive_apply_order.length,3);
  await db.exec(await readFile(new URL(manifest.additive_apply_order[2],root),'utf8'));
  assert.equal((await db.query('SELECT state FROM public.snap_hosted_fixture')).rows[0].state,'ready');
  assert.equal((await db.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity")).rows[0].n,0);
  const a='30000000-0000-4000-8000-000000000001',b='30000000-0000-4000-8000-000000000002';
  const property='40000000-0000-4000-8000-000000000001';
  const orgA=await newUser(db,a,{role:'admin',org_id:'00000000-0000-0000-0000-000000000001'});
  const orgB=await newUser(db,b);assert.notEqual(orgA,orgB);
  // This temporary test probe is never installed by hosted SQL. It represents
  // a trusted SQL definer dependency calling has_role for a different account.
  await db.exec(`CREATE FUNCTION snap_security.local_trusted_role_probe_fixture(u uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT public.has_role(u,'user') $$;
    REVOKE ALL ON FUNCTION snap_security.local_trusted_role_probe_fixture(uuid) FROM PUBLIC,anon,authenticated,service_role;
    GRANT EXECUTE ON FUNCTION snap_security.local_trusted_role_probe_fixture(uuid) TO authenticated;`);
  await asRole(db,'authenticated',a,async()=>{
    assert.equal((await db.query("SELECT public.has_role($1,'user') allowed",[a])).rows[0].allowed,true);
    assert.equal((await db.query("SELECT public.has_role($1,'admin') allowed",[a])).rows[0].allowed,false);
    assert.equal((await db.query("SELECT public.has_role($1,'user') allowed",[b])).rows[0].allowed,false);
    assert.equal((await db.query("SELECT public.has_role(NULL,'user') allowed")).rows[0].allowed,false);
    assert.equal((await db.query("SELECT snap_security.has_own_role_fixture_v1($1,'user') allowed",[b])).rows[0].allowed,false);
    assert.equal((await db.query('SELECT snap_security.local_trusted_role_probe_fixture($1) allowed',[b])).rows[0].allowed,true);
  });
  await asRole(db,'authenticated',null,async()=>{
    assert.equal((await db.query("SELECT public.has_role($1,'user') allowed",[a])).rows[0].allowed,false);
  });
  await asRole(db,'anon',null,async()=>{
    await assert.rejects(db.query("SELECT public.has_role($1,'user')",[a]),/permission denied/);
  });
  await db.exec('DROP FUNCTION snap_security.local_trusted_role_probe_fixture(uuid)');
  await db.exec(`INSERT INTO public.properties(id,address) VALUES('${property}','Synthetic ordinary property');
    INSERT INTO public.unlocked_properties(user_id,property_id) VALUES('${a}','${property}');`);
  let lead;
  await asRole(db,'authenticated',a,async()=>{
    assert.equal((await db.query('SELECT public.fn_customer_workspace_ready_v1() ready')).rows[0].ready,true);
    assert.deepEqual((await db.query('SELECT role FROM public.user_roles')).rows.map(r=>r.role),['user']);
    assert.equal((await db.query('SELECT count(*)::int n FROM public.pipeline_stages')).rows[0].n,7);
    lead=(await db.query('SELECT * FROM public.fn_crm_add_property_v1($1)',[property])).rows[0];assert.ok(lead.id);
    assert.equal((await db.query('SELECT * FROM public.fn_crm_add_property_v1($1)',[property])).rows[0].id,lead.id);
    await db.query('INSERT INTO public.crm_contacts(lead_id,org_id,name,source) VALUES($1,$2,$3,$4)',[lead.id,orgA,'Synthetic contact','Synthetic fixture']);
    await db.query("INSERT INTO public.lead_activities(lead_id,org_id,actor_id,activity_type,payload) VALUES($1,$2,$3,'note','{\"note\":\"Synthetic private note\"}')",[lead.id,orgA,a]);
    const outcome='70000000-0000-4000-8000-000000000001',stale='70000000-0000-4000-8000-000000000002';
    const priorTimestamp=(await db.query('SELECT updated_at::text AS stamp FROM public.leads WHERE id=$1',[lead.id])).rows[0].stamp;
    const command=[lead.id,outcome,priorTimestamp,'research','Synthetic conflict verification',null,null,false];
    const outcomeSql='SELECT * FROM public.fn_crm_record_outcome_v1($1,$2,$3,$4,$5,$6,$7,$8)';
    assert.equal((await db.query(outcomeSql,command)).rows[0].id,lead.id);
    assert.equal((await db.query(outcomeSql,command)).rows[0].id,lead.id,'Exact outcome retry remains idempotent');
    await assert.rejects(db.query(outcomeSql,[lead.id,stale,...command.slice(2)]),error=>error.code==='PT409');
    assert.equal((await db.query('SELECT count(*)::int n FROM public.lead_activities WHERE id=$1',[stale])).rows[0].n,0);
    assert.equal((await db.query('SELECT count(*)::int n FROM public.fn_get_user_subscription($1)',[a])).rows[0].n,0);
    assert.equal((await db.query('SELECT public.fn_get_trial_status($1) state',[a])).rows[0].state.can_export,false);
    assert.equal((await db.query('SELECT balance FROM public.v_user_credits')).rows[0].balance,0);
    for(const relation of ['sms_threads','sms_messages','drip_sequences','drip_steps','drip_enrollments'])await db.query(`SELECT * FROM public.${relation}`);
    await assert.rejects(db.query("INSERT INTO public.unlocked_properties(user_id,property_id) VALUES($1,$2)",[b,property]),/permission denied/);
    await assert.rejects(db.query('SELECT * FROM public.snap_hosted_fixture'),/permission denied/);
  });
  await asRole(db,'authenticated',b,async()=>{
    for(const relation of ['leads','lead_activities','crm_contacts','unlocked_properties','properties'])
      assert.equal((await db.query(`SELECT count(*)::int n FROM public.${relation}`)).rows[0].n,0);
    await assert.rejects(db.query('SELECT * FROM public.fn_crm_add_property_v1($1)',[property]),/not currently available/);
    await assert.rejects(db.query('SELECT public.fn_get_current_usage($1)',[a]),/Account access denied/);
  });
  await asRole(db,'anon',null,async()=>{
    await assert.rejects(db.query('SELECT * FROM public.leads'),/permission denied/);
    await assert.rejects(db.query('SELECT * FROM public.fn_crm_add_property_v1($1)',[property]),/permission denied/);
  });
  await asRole(db,'service_role',null,async()=>{
    assert.equal((await db.query('SELECT state FROM public.snap_hosted_fixture')).rows[0].state,'ready');
    await assert.rejects(db.query("UPDATE public.snap_hosted_fixture SET state='baseline_only'"),/permission denied/);
    assert.equal((await db.query('SELECT public.fn_billing_checkout_enabled_v1() enabled')).rows[0].enabled,false);
  });
  // The limited lineage fixture verifies preservation and denial only. It does
  // not prove real source receipts, accepted municipal data, or successful detail.
  const acceptance='50000000-0000-4000-8000-000000000001',annotation='60000000-0000-4000-8000-000000000001';
  await db.query('INSERT INTO snap_relaunch.customer_property_mappings(customer_property_id,created_for_source) VALUES($1,true)',[property]);
  await db.query("INSERT INTO snap_relaunch.customer_source_acceptances(id,consumer_user_id,valid_until,revoked) VALUES($1,$2,now()-interval '1 day',true)",[acceptance,a]);
  await db.query("INSERT INTO public.lead_activities(id,lead_id,org_id,actor_id,activity_type,payload) VALUES($1,$2,$3,$4,'system','{\"description\":\"Synthetic source annotation\"}')",[annotation,lead.id,orgA,a]);
  await db.query('INSERT INTO snap_relaunch.source_crm_links(lead_id,activity_id,acceptance_id,consumer_user_id,org_id) VALUES($1,$2,$3,$4,$5)',[lead.id,annotation,acceptance,a,orgA]);
  await asRole(db,'authenticated',a,async()=>{
    assert.equal((await db.query('SELECT count(*)::int n FROM public.leads')).rows[0].n,1);
    assert.equal((await db.query("SELECT count(*)::int n FROM public.lead_activities WHERE activity_type='note'")).rows[0].n,1);
    assert.equal((await db.query('SELECT count(*)::int n FROM public.lead_activities WHERE id=$1',[annotation])).rows[0].n,0);
    assert.equal((await db.query('SELECT count(*)::int n FROM public.properties')).rows[0].n,0);
    await assert.rejects(db.query('SELECT public.fn_get_source_crm_detail_v1($1)',[lead.id]),/Source detail is held/);
  });
  await assert.rejects(db.query('DELETE FROM public.properties WHERE id=$1',[property]),/source|Source|foreign key/i);
  console.log('PASS: generated SQL, two fixed search paths, self-only customer role checks with trusted definer compatibility, private workspaces, scoped reads, CRM handoff and PT409 conflict/retry, minimal grants, source-history preservation; PGlite only, no hosted claim.');
}finally{await db.close();}
