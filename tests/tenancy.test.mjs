import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createTenancyDb, asRole, newUser, migration } from './helpers/tenancy-db.mjs';
const id = n => `11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
const legacy = '00000000-0000-0000-0000-000000000001';

test('workspace isolation and CRM preservation in isolated PostgreSQL', async t => {
  const db = await createTenancyDb({applyMigration:false});
  t.after(() => db.close());
  const admin=id(1), va=id(2), oldCustomer=id(3), blockedCustomer=id(4), a=id(5), b=id(6), anonUser=id(7);
  await newUser(db,admin); await newUser(db,va); await newUser(db,oldCustomer); await newUser(db,blockedCustomer);
  await db.query(`INSERT INTO public.user_roles VALUES ($1,'admin'),($2,'va')`,[admin,va]);
  await db.query(`INSERT INTO public.foia_profiles VALUES ($1,'va')`,[va]);
  const prop=id(100), prop2=id(101), sourceProp=id(102);
  await db.query(`INSERT INTO public.properties(id,address) VALUES ($1,'Fixture A'),($2,'Fixture B'),($3,'Fixture source')`,[prop,prop2,sourceProp]);
  const legacyStage=(await db.query(`SELECT id FROM public.pipeline_stages WHERE org_id=$1 ORDER BY sort_order LIMIT 1`,[legacy])).rows[0].id;
  const legacyLead=id(200);
  await db.query(`INSERT INTO public.leads(id,org_id,property_id,stage_id,created_by,notes) VALUES ($1,$2,$3,$4,$5,'Legacy private note')`,[legacyLead,legacy,prop,legacyStage,blockedCustomer]);
  await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`,import.meta.url),'utf8'));
  const orgA=await newUser(db,a,{org_id:legacy,role:'admin',full_name:'Fixture A'}), orgB=await newUser(db,b);
  const orgAnon=await newUser(db,anonUser); await db.query('UPDATE auth.users SET is_anonymous=true WHERE id=$1',[anonUser]);
  const auth=(u,fn)=>asRole(db,'authenticated',u,fn);
  const denied=async(fn,codes=['42501','23514','23503'])=>assert.rejects(fn,e=>codes.includes(e.code));
  const firstStage=async org=>(await db.query('SELECT id FROM public.pipeline_stages WHERE org_id=$1 ORDER BY sort_order LIMIT 1',[org])).rows[0].id;
  const stageA=await firstStage(orgA),stageB=await firstStage(orgB);

  await t.test('new unrelated signups get distinct private orgs and seven stages; metadata cannot grant authority',async()=>{
    assert.notEqual(orgA,orgB);assert.notEqual(orgA,legacy);
    assert.equal((await db.query('SELECT count(*)::int n FROM public.pipeline_stages WHERE org_id=$1',[orgA])).rows[0].n,7);
    assert.deepEqual((await db.query('SELECT role FROM public.user_roles WHERE user_id=$1',[a])).rows,[{role:'user'}]);
    await auth(a,async()=>assert.equal((await db.query('SELECT public.fn_customer_workspace_ready_v1() ready')).rows[0].ready,true));
  });
  await t.test('anonymous role, null uid, and anonymous account cannot access customer workspaces',async()=>{
    await asRole(db,'anon',null,()=>denied(()=>db.query('SELECT * FROM public.leads')));
    await auth(null,async()=>assert.equal((await db.query('SELECT count(*)::int n FROM public.pipeline_stages')).rows[0].n,0));
    await auth(anonUser,async()=>assert.equal((await db.query('SELECT snap_security.can_access_workspace($1) ok',[orgAnon])).rows[0].ok,false));
  });
  await t.test('legacy customer and VA quarantined; internal admin retains existing workspace',async()=>{
    for(const u of [oldCustomer,blockedCustomer,va]) await auth(u,async()=>{
      assert.equal((await db.query('SELECT count(*)::int n FROM public.leads')).rows[0].n,0);
      assert.equal((await db.query('SELECT public.fn_customer_workspace_ready_v1() ok')).rows[0].ok,false);
    });
    await auth(admin,async()=>assert.equal((await db.query('SELECT count(*)::int n FROM public.leads')).rows[0].n,1));
    assert.deepEqual((await db.query('SELECT role FROM public.foia_profiles WHERE id=$1',[va])).rows,[{role:'va'}]);
    // Model the existing SECURITY DEFINER source handoff's CRM write path.
    await db.exec(`CREATE FUNCTION public.fixture_privileged_handoff(o uuid,p uuid,s uuid) RETURNS uuid
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE result uuid; BEGIN
      INSERT INTO public.leads(org_id,property_id,stage_id,created_by) VALUES(o,p,s,auth.uid()) RETURNING id INTO result;
      RETURN result; END $$; GRANT EXECUTE ON FUNCTION public.fixture_privileged_handoff(uuid,uuid,uuid) TO authenticated;`);
    await auth(oldCustomer,()=>denied(()=>db.query('SELECT public.fixture_privileged_handoff($1,$2,$3)',[legacy,prop2,legacyStage])));
    await db.exec('DROP FUNCTION public.fixture_privileged_handoff(uuid,uuid,uuid)');
  });
  await t.test('membership registry, profile identity, and self role escalation cannot be written by customer',async()=>{
    await auth(a,async()=>{
      await denied(()=>db.query('INSERT INTO snap_security.workspace_owners VALUES ($1,$2,null,now(),\'signup\',null)',[a,orgB]));
      assert.equal((await db.query('UPDATE public.profiles SET org_id=$1 WHERE user_id=$2 RETURNING user_id',[orgB,a])).rows.length,0);
      await denied(()=>db.query(`INSERT INTO public.user_roles VALUES ($1,'admin')`,[a]));
      await denied(()=>db.query(`SELECT public.fn_provision_customer_workspace_v1($1,'forged review')`,[a]));
    });
    await auth(admin,()=>denied(()=>db.query('UPDATE public.profiles SET org_id=$1 WHERE user_id=$2',[orgA,admin])));
  });
  await t.test('preflight identifies eligible clean accounts, preserves staff, blocks owned rows',async()=>{
    const rows=await asRole(db,'service_role',null,()=>db.query('SELECT * FROM public.fn_workspace_backfill_report_v1()'));
    const map=new Map(rows.rows.map(r=>[r.user_id,r.assessment]));
    assert.equal(map.get(oldCustomer).eligible,true);
    assert.equal(map.get(blockedCustomer).reason,'owned_rows_need_review');
    assert.equal(map.get(blockedCustomer).conflicts.leads,1);
    assert.equal(map.get(admin).reason,'internal_staff_preserved');assert.equal(map.get(va).reason,'internal_staff_preserved');
  });
  await t.test('reviewed per-account backfill is atomic, idempotent, and never moves legacy work',async()=>{
    await asRole(db,'service_role',null,async()=>{
      await assert.rejects(()=>db.query('SELECT public.fn_provision_customer_workspace_v1($1,$2)',[oldCustomer,'short']));
      const r=(await db.query('SELECT public.fn_provision_customer_workspace_v1($1,$2) result',[oldCustomer,'audit-fixture-review-001'])).rows[0].result;
      assert.equal(r.replayed,false);assert.notEqual(r.org_id,legacy);
      const again=(await db.query('SELECT public.fn_provision_customer_workspace_v1($1,$2) result',[oldCustomer,'audit-fixture-review-001'])).rows[0].result;
      assert.equal(again.org_id,r.org_id);assert.equal(again.replayed,true);
      await assert.rejects(()=>db.query('SELECT public.fn_provision_customer_workspace_v1($1,$2)',[blockedCustomer,'audit-fixture-review-001']));
    });
    assert.deepEqual((await db.query('SELECT org_id,notes FROM public.leads WHERE id=$1',[legacyLead])).rows,[{org_id:legacy,notes:'Legacy private note'}]);
    await auth(oldCustomer,async()=>assert.equal((await db.query('SELECT public.fn_customer_workspace_ready_v1() ready')).rows[0].ready,true));
  });

  const leadA=id(201),leadB=id(202),ownerA=id(300),ownerB=id(301),integrationA=id(310),integrationB=id(311);
  await db.query(`INSERT INTO public.owners(id,org_id,property_id,source,created_by,name) VALUES ($1,$2,$3,'fixture',$4,'A private'),($5,$6,$3,'fixture',$7,'B private')`,[ownerA,orgA,prop,a,ownerB,orgB,b]);
  await db.query(`INSERT INTO public.leads(id,org_id,property_id,stage_id,created_by,assigned_to,owner_id,notes) VALUES ($1,$2,$3,$4,$5,$5,$6,'A notes'),($7,$8,$3,$9,$10,$10,$11,'B notes')`,[leadA,orgA,prop,stageA,a,ownerA,leadB,orgB,stageB,b,ownerB]);
  await db.query(`INSERT INTO public.lead_activities(lead_id,org_id,actor_id,activity_type,payload) VALUES ($1,$2,$3,'note','{"note":"A history"}'),($4,$5,$6,'note','{"note":"B history"}')`,[leadA,orgA,a,leadB,orgB,b]);
  await db.query(`INSERT INTO public.user_integrations(id,user_id,org_id,service_name,vault_secret_id) VALUES ($1,$2,$3,'twilio',$4),($5,$6,$7,'twilio',$8)`,[integrationA,a,orgA,id(312),integrationB,b,orgB,id(313)]);
  await t.test('two accounts cannot read each other leads, notes, contacts, stages or provider accounts',async()=>{
    for(const [user,ownOrg] of [[a,orgA],[b,orgB]]) await auth(user,async()=>{
      for(const table of ['leads','lead_activities','owners','pipeline_stages','user_integrations']){
        const rows=(await db.query(`SELECT org_id FROM public.${table}`)).rows;
        assert.ok(rows.length>0,table);assert.ok(rows.every(r=>r.org_id===ownOrg),table);
      }
    });
    await auth(admin,async()=>assert.deepEqual((await db.query('SELECT id FROM public.leads ORDER BY id')).rows,[{id:legacyLead}]));
  });
  await t.test('cross-workspace guessed ids and assignments fail at database layer, including service writers',async()=>{
    await auth(a,async()=>{
      assert.equal((await db.query('UPDATE public.leads SET notes=\'stolen\' WHERE id=$1 RETURNING id',[leadB])).rows.length,0);
      await denied(()=>db.query('UPDATE public.leads SET stage_id=$1 WHERE id=$2',[stageB,leadA]));
      await denied(()=>db.query('UPDATE public.leads SET owner_id=$1 WHERE id=$2',[ownerB,leadA]));
      await denied(()=>db.query('UPDATE public.leads SET assigned_to=$1 WHERE id=$2',[b,leadA]));
      await denied(()=>db.query('UPDATE public.leads SET created_by=$1 WHERE id=$2',[b,leadA]));
      await denied(()=>db.query(`INSERT INTO public.lead_activities(lead_id,org_id,actor_id,activity_type) VALUES ($1,$2,$3,'note')`,[leadB,orgA,a]));
      await denied(()=>db.query(`INSERT INTO public.lead_activities(lead_id,org_id,actor_id,activity_type) VALUES ($1,$2,$3,'note')`,[leadA,orgA,b]));
      await denied(()=>db.query(`UPDATE public.user_integrations SET user_id=$1 WHERE id=$2`,[b,integrationA]));
    });
    await asRole(db,'service_role',null,()=>denied(()=>db.query('UPDATE public.leads SET stage_id=$1 WHERE id=$2',[stageB,leadA])));
  });
  await t.test('direct lead insert cannot bypass the property hold or missing unlock',async()=>{
    await auth(a,()=>denied(()=>db.query(`INSERT INTO public.leads(org_id,property_id,stage_id,created_by) VALUES ($1,$2,$3,$4)`,[orgA,prop2,stageA,a])));
    await db.query('INSERT INTO public.unlocked_properties VALUES ($1,$2)',[a,prop2]);
    await auth(a,()=>denied(()=>db.query(`INSERT INTO public.leads(org_id,property_id,stage_id,created_by) VALUES ($1,$2,$3,$4)`,[orgA,prop2,stageA,a])));
    await auth(a,async()=>assert.equal((await db.query('SELECT count(*)::int n FROM public.properties')).rows[0].n,0));
  });
  await t.test('provider upsert is workspace-specific and preserves the other customers contact',async()=>{
    await asRole(db,'service_role',null,()=>db.query(`INSERT INTO public.owners(org_id,property_id,source,created_by,name) VALUES ($1,$2,'fixture',$3,'A revised') ON CONFLICT(org_id,property_id,source) DO UPDATE SET name=excluded.name`,[orgA,prop,a]));
    assert.deepEqual((await db.query('SELECT id,name FROM public.owners WHERE id IN ($1,$2) ORDER BY id',[ownerA,ownerB])).rows,[{id:ownerA,name:'A revised'},{id:ownerB,name:'B private'}]);
  });
  await t.test('hard-delete of a shared property fails without losing either private lead or note',async()=>{
    const before=(await db.query('SELECT id,notes,stage_id,assigned_to FROM public.leads WHERE property_id=$1 ORDER BY id',[prop])).rows;
    const history=(await db.query('SELECT id,payload FROM public.lead_activities ORDER BY id')).rows;
    await assert.rejects(()=>db.query('DELETE FROM public.properties WHERE id=$1',[prop]),e=>['23503','23001'].includes(e.code));
    assert.deepEqual((await db.query('SELECT id,notes,stage_id,assigned_to FROM public.leads WHERE property_id=$1 ORDER BY id',[prop])).rows,before);
    assert.deepEqual((await db.query('SELECT id,payload FROM public.lead_activities ORDER BY id')).rows,history);
  });
  await t.test('legacy notes, saved list links and purchased unlocks also block property cleanup',async()=>{
    const oldNoteProperty=id(701), listProperty=id(702), purchasedProperty=id(703),list=id(704);
    await db.query("INSERT INTO public.properties(id,address) VALUES ($1,'Old note'),($2,'Saved'),($3,'Purchased')",[oldNoteProperty,listProperty,purchasedProperty]);
    await db.query("INSERT INTO public.lead_activity(property_id,user_id,notes) VALUES ($1,$2,'Historical research')",[oldNoteProperty,b]);
    await db.query("INSERT INTO public.lead_lists(id,user_id,name) VALUES ($1,$2,'Saved list')",[list,b]);
    await db.query('INSERT INTO public.list_properties(list_id,property_id) VALUES ($1,$2)',[list,listProperty]);
    await db.query('INSERT INTO public.unlocked_properties(user_id,property_id) VALUES ($1,$2)',[b,purchasedProperty]);
    for(const property of [oldNoteProperty,listProperty,purchasedProperty]) await assert.rejects(()=>db.query('DELETE FROM public.properties WHERE id=$1',[property]),e=>['23503','23001'].includes(e.code));
    assert.equal((await db.query('SELECT notes FROM public.lead_activity WHERE property_id=$1',[oldNoteProperty])).rows[0].notes,'Historical research');
    assert.equal((await db.query('SELECT count(*)::int n FROM public.list_properties WHERE property_id=$1',[listProperty])).rows[0].n,1);
    assert.equal((await db.query('SELECT count(*)::int n FROM public.unlocked_properties WHERE property_id=$1',[purchasedProperty])).rows[0].n,1);
  });
  await t.test('tag, message, and enrollment references cannot cross tenant boundaries',async()=>{
    const tagB=id(400),threadB=id(401),seqB=id(402);
    await db.query(`INSERT INTO public.lead_tags(id,org_id,label) VALUES ($1,$2,'B tag')`,[tagB,orgB]);
    await db.query(`INSERT INTO public.sms_threads(id,org_id,lead_id,from_number,to_number) VALUES ($1,$2,$3,'+15550000001','+15550000002')`,[threadB,orgB,leadB]);
    await db.query(`INSERT INTO public.drip_sequences(id,org_id,name) VALUES ($1,$2,'B sequence')`,[seqB,orgB]);
    await auth(a,async()=>{
      await denied(()=>db.query('INSERT INTO public.lead_tag_assignments(lead_id,tag_id) VALUES ($1,$2)',[leadA,tagB]));
      await denied(()=>db.query(`INSERT INTO public.sms_messages(thread_id,org_id,direction,body) VALUES ($1,$2,'outbound','fixture')`,[threadB,orgA]));
      await denied(()=>db.query('INSERT INTO public.drip_enrollments(org_id,lead_id,sequence_id) VALUES ($1,$2,$3)',[orgA,leadA,seqB]));
    });
  });
  await t.test('source expiry and revocation hide receipt data but preserve customer-created notes and workflow',async()=>{
    const sourceLead=id(501),receipt=id(502),annotation=id(503),privateNote=id(504);
    await db.query(`INSERT INTO public.leads(id,org_id,property_id,stage_id,created_by,notes) VALUES ($1,$2,$3,$4,$5,'Private source lead')`,[sourceLead,orgA,sourceProp,stageA,a]);
    await db.query(`INSERT INTO public.lead_activities(id,lead_id,org_id,actor_id,activity_type,payload) VALUES ($1,$2,$3,$4,'system','{"event":"source_snapshot_linked"}'),($5,$2,$3,$4,'note','{"note":"Follow up Thursday"}')`,[annotation,sourceLead,orgA,a,privateNote]);
    await db.query('INSERT INTO snap_relaunch.customer_property_mappings(id,customer_property_id,created_for_source) VALUES ($1,$2,true)',[id(505),sourceProp]);
    await db.query(`INSERT INTO snap_relaunch.customer_source_acceptances(id,consumer_user_id,valid_until,mapping_ids) VALUES ($1,$2,now()+interval '1 day',ARRAY[$3::uuid])`,[receipt,a,id(505)]);
    await db.query('INSERT INTO snap_relaunch.source_crm_links(lead_id,activity_id,acceptance_id,consumer_user_id,org_id) VALUES ($1,$2,$3,$4,$5)',[sourceLead,annotation,receipt,a,orgA]);
    await auth(a,async()=>{
      assert.equal((await db.query('SELECT count(*)::int n FROM public.lead_activities WHERE lead_id=$1',[sourceLead])).rows[0].n,2);
      assert.equal((await db.query('SELECT public.fn_source_property_visible_v1($1) ok',[sourceProp])).rows[0].ok,true);
    });
    for(const revokeSql of ["UPDATE snap_relaunch.customer_source_acceptances SET valid_until=now()-interval '1 day' WHERE id=$1","UPDATE snap_relaunch.customer_source_acceptances SET valid_until=now()+interval '1 day',revoked=true WHERE id=$1"]){
      await db.query(revokeSql,[receipt]);
      await auth(a,async()=>{
        assert.equal((await db.query('SELECT notes FROM public.leads WHERE id=$1',[sourceLead])).rows[0].notes,'Private source lead');
        assert.deepEqual((await db.query('SELECT id FROM public.lead_activities WHERE lead_id=$1',[sourceLead])).rows,[{id:privateNote}]);
        assert.equal((await db.query('SELECT public.fn_source_property_visible_v1($1) ok',[sourceProp])).rows[0].ok,false);
        await db.query('UPDATE public.leads SET next_follow_up_at=now()+interval \'1 day\' WHERE id=$1',[sourceLead]);
      });
      await auth(b,async()=>assert.equal((await db.query('SELECT count(*)::int n FROM public.leads WHERE id=$1',[sourceLead])).rows[0].n,0));
    }
    await assert.rejects(()=>db.query(`UPDATE public.lead_activities SET payload='{}' WHERE id=$1`,[annotation]),e=>e.code==='42501');
    await assert.rejects(()=>db.query('UPDATE public.leads SET created_by=$1 WHERE id=$2',[b,sourceLead]));
  });
  await t.test('privileged helper ACLs and organization balances stay server managed',async()=>{
    const privileged=['public.handle_new_user()', 'public.fn_workspace_backfill_report_v1()',
      'public.fn_provision_customer_workspace_v1(uuid,text)', 'snap_security.workspace_backfill_preflight(uuid)'];
    for(const signature of privileged){
      for(const role of ['anon','authenticated']) assert.equal((await db.query("SELECT has_function_privilege($1,$2,'execute') ok",[role,signature])).rows[0].ok,false,`${role} ${signature}`);
    }
    await auth(b,async()=>{
      await denied(()=>db.query('UPDATE public.organizations SET credits=999999 WHERE id=$1',[orgB]));
      await denied(()=>db.query('UPDATE public.user_integrations SET vault_secret_id=$1 WHERE id=$2',[id(999),integrationB]));
      await db.query("UPDATE public.organizations SET name='Fixture workspace renamed' WHERE id=$1",[orgB]);
    });
  });
  await t.test('global opt-outs are enforced by service reads without exposing their raw contact data to customers',async()=>{
    await db.query("INSERT INTO public.suppression_list(org_id,phone_number,reason) VALUES (null,'+15550001111','global opt-out'),($1,'+15550002222','own opt-out')",[orgB]);
    await auth(b,async()=>assert.deepEqual((await db.query('SELECT phone_number FROM public.suppression_list')).rows,[{phone_number:'+15550002222'}]));
    await asRole(db,'service_role',null,async()=>assert.equal((await db.query('SELECT count(*)::int n FROM public.suppression_list')).rows[0].n,2));
  });
  await t.test('banned and deleted accounts lose workspace access immediately',async()=>{
    await db.query(`UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=$1`,[a]);
    await auth(a,async()=>assert.equal((await db.query('SELECT count(*)::int n FROM public.leads')).rows[0].n,0));
    await db.query('UPDATE auth.users SET banned_until=null,deleted_at=now() WHERE id=$1',[a]);
    await auth(a,async()=>assert.equal((await db.query('SELECT public.fn_customer_workspace_ready_v1() ok')).rows[0].ok,false));
  });
});
