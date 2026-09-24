import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTenancyDb,asRole,newUser} from './helpers/tenancy-db.mjs';
import {crmKey,parseMoney,nextActionInput,dueBucket,propertyLink,validateContact,csvCell} from '../src/services/crmModel.ts';
const id=n=>`22222222-2222-4222-8222-${String(n).padStart(12,'0')}`;

test('CRM input rules preserve timezones, money bounds and private CSV safety',()=>{
  assert.notDeepEqual(crmKey(id(1),'lead',id(2)),crmKey(id(3),'lead',id(2)));
  assert.equal(parseMoney('0'),0);assert.equal(parseMoney(''),null);assert.equal(parseMoney('12450.50'),12450.5);
  for(const bad of ['-5','1e5','NaN','1.234','1000000000000'])assert.throws(()=>parseMoney(bad));
  assert.deepEqual(nextActionInput('Review file','2026-10-02T14:15:00-04:00'),{next_action:'Review file',next_follow_up_at:'2026-10-02T18:15:00.000Z'});
  assert.throws(()=>nextActionInput('Call',''));assert.throws(()=>nextActionInput('','2026-10-01T00:00'));
  const now=new Date('2026-10-02T12:00:00Z');assert.equal(dueBucket('2026-10-01T12:00:00Z',now),'overdue');assert.equal(dueBucket('2026-10-03T12:00:00Z',now),'upcoming');assert.equal(dueBucket(null,now),'unscheduled');
  assert.equal(propertyLink(id(2)),`/properties?propertyId=${id(2)}`);
  assert.throws(()=>validateContact({name:'Owner',phone:'5550001111',email:'broken',source:'provided manually'}));
  assert.throws(()=>validateContact({name:'Owner',phone:'',email:'',source:''}));
  assert.equal(csvCell('=HYPERLINK("x")'),'"\'=HYPERLINK(""x"")"');assert.equal(csvCell('plain, label'),'"plain, label"');
});

test('private CRM persistence, authorization and atomic outcomes in PostgreSQL',async t=>{
  const db=await createTenancyDb();t.after(()=>db.close());
  await db.exec(await readFile(new URL('../supabase/migrations/20260924183021_snap_crm_workflow_v1.sql',import.meta.url),'utf8'));
  const a=id(1),b=id(2),orgA=await newUser(db,a),orgB=await newUser(db,b),prop=id(10),held=id(11);
  await db.query("INSERT INTO public.properties(id,address) VALUES ($1,'123 Fixture Street'),($2,'Held record')",[prop,held]);
  await db.query('INSERT INTO public.unlocked_properties VALUES ($1,$2)',[a,prop]);
  // Fixture-only release: production hold policies are never changed by the candidate.
  await db.exec('CREATE POLICY fixture_released_property ON public.properties FOR SELECT TO authenticated USING(id IN (SELECT property_id FROM public.unlocked_properties WHERE user_id=auth.uid()))');
  const auth=(user,fn)=>asRole(db,'authenticated',user,fn);
  let lead;
  await t.test('handoff retries create one lead with one creation receipt; denied property cannot create',async()=>{
    await auth(a,async()=>{
      const add=()=>db.query('SELECT (public.fn_crm_add_property_v1($1)).*',[prop]);
      lead=(await add()).rows[0];assert.equal(lead.title,'123 Fixture Street');
      assert.equal((await add()).rows[0].id,lead.id);
      assert.equal((await db.query('SELECT count(*)::int n FROM public.leads')).rows[0].n,1);
      assert.equal((await db.query("SELECT count(*)::int n FROM public.lead_activities WHERE payload->>'description'='Property saved to the private pipeline.'")).rows[0].n,1);
      await assert.rejects(()=>db.query('SELECT public.fn_crm_add_property_v1($1)',[held]),e=>e.code==='42501');
    });
  });
  await t.test('archive restores same id, stage, private notes and contacts',async()=>{
    await auth(a,async()=>{
      await db.query("INSERT INTO public.lead_activities(lead_id,org_id,actor_id,activity_type,payload) VALUES ($1,$2,$3,'note','{\"note\":\"Keep this private note\"}')",[lead.id,orgA,a]);
      await db.query("INSERT INTO public.crm_contacts(id,lead_id,org_id,name,source) VALUES ($1,$2,$3,'Fixture owner','Owner gave details')",[id(20),lead.id,orgA]);
      await db.query('UPDATE public.leads SET archived_at=now() WHERE id=$1',[lead.id]);
      const restored=(await db.query('SELECT (public.fn_crm_add_property_v1($1)).*',[prop])).rows[0];
      assert.equal(restored.id,lead.id);assert.equal(restored.stage_id,lead.stage_id);assert.equal(restored.archived_at,null);
      assert.equal((await db.query("SELECT payload->>'note' note FROM public.lead_activities WHERE activity_type='note'")).rows[0].note,'Keep this private note');
      assert.equal((await db.query('SELECT name FROM public.crm_contacts')).rows[0].name,'Fixture owner');
    });
  });
  await t.test('stage changes persist and append exactly one stage history event',async()=>auth(a,async()=>{
    const target=(await db.query('SELECT id FROM public.pipeline_stages WHERE org_id=$1 AND id<>$2 ORDER BY sort_order LIMIT 1',[orgA,lead.stage_id])).rows[0].id;
    const changed=(await db.query('UPDATE public.leads SET stage_id=$1 WHERE id=$2 RETURNING stage_id',[target,lead.id])).rows[0];assert.equal(changed.stage_id,target);
    assert.equal((await db.query("SELECT count(*)::int n FROM public.lead_activities WHERE lead_id=$1 AND activity_type='stage_change'",[lead.id])).rows[0].n,1);
  }));
  await t.test('server rejects invalid deal amounts and incomplete action date pairs',async()=>auth(a,async()=>{
    await assert.rejects(()=>db.query('UPDATE public.leads SET offer_amount=-1 WHERE id=$1',[lead.id]),e=>e.code==='23514');
    await assert.rejects(()=>db.query("UPDATE public.leads SET next_action='Review' WHERE id=$1",[lead.id]),e=>e.code==='23514');
    await db.query("UPDATE public.leads SET next_action='Review source',next_follow_up_at='2026-10-01T15:00Z',estimated_value=250000,estimated_repairs=20000,offer_amount=160000 WHERE id=$1",[lead.id]);
    const saved=(await db.query('SELECT * FROM public.leads WHERE id=$1',[lead.id])).rows[0];assert.equal(saved.next_action,'Review source');assert.equal(Number(saved.offer_amount),160000);
  }));
  await t.test('one outcome completes and schedules atomically; same request is idempotent; mutation rejected',async()=>auth(a,async()=>{
    const initial=(await db.query('SELECT * FROM public.leads WHERE id=$1',[lead.id])).rows[0];
    const args=[lead.id,id(30),initial.updated_at,'no_answer','Attempted manually','Try another day','2026-10-02T18:00Z',true];
    const sql='SELECT (public.fn_crm_record_outcome_v1($1,$2,$3,$4,$5,$6,$7,$8)).*';
    const result=(await db.query(sql,args)).rows[0];assert.equal(result.next_action,'Try another day');assert.equal(result.last_contacted_at,null);
    await db.query(sql,args);
    assert.equal((await db.query('SELECT count(*)::int n FROM public.lead_activities WHERE id=$1',[id(30)])).rows[0].n,1);
    const payload=(await db.query('SELECT payload FROM public.lead_activities WHERE id=$1',[id(30)])).rows[0].payload;assert.equal(payload.completed_action,'Review source');
    await assert.rejects(()=>db.query(sql,[...args.slice(0,4),'Changed body',...args.slice(5)]),e=>e.code==='22023');
    await assert.rejects(()=>db.query(sql,[lead.id,id(31),initial.updated_at,'research','Stale',null,null,true]),e=>e.code==='40001');
    assert.equal((await db.query('SELECT count(*)::int n FROM public.lead_activities WHERE id=$1',[id(31)])).rows[0].n,0);
  }));
  await t.test('successful conversation updates last-contact time; DNC persists for current and future contacts',async()=>auth(a,async()=>{
    const sql='SELECT (public.fn_crm_record_outcome_v1($1,$2,$3,$4,$5,$6,$7,$8)).*';
    const before=(await db.query('SELECT * FROM public.leads WHERE id=$1',[lead.id])).rows[0];
    const reached=(await db.query(sql,[lead.id,id(32),before.updated_at,'reached_owner','Spoke manually',null,null,true])).rows[0];assert.ok(reached.last_contacted_at);
    const stopped=(await db.query(sql,[lead.id,id(33),reached.updated_at,'do_not_contact','Owner requested no contact. '+ 'x'.repeat(1500),null,null,false])).rows[0];assert.equal(stopped.contact_restricted,true);
    assert.equal((await db.query('SELECT length(restriction_note)::int n FROM public.crm_contacts WHERE id=$1',[id(20)])).rows[0].n,1000);
    assert.ok((await db.query("SELECT length(payload->>'note')::int n FROM public.lead_activities WHERE id=$1",[id(33)])).rows[0].n>1500);
    assert.equal((await db.query('SELECT do_not_contact FROM public.crm_contacts WHERE id=$1',[id(20)])).rows[0].do_not_contact,true);
    await assert.rejects(()=>db.query('UPDATE public.crm_contacts SET do_not_contact=false WHERE id=$1',[id(20)]),e=>e.code==='42501');
    await assert.rejects(()=>db.query('UPDATE public.leads SET contact_restricted=false WHERE id=$1',[lead.id]),e=>e.code==='42501');
    await db.query("INSERT INTO public.crm_contacts(lead_id,org_id,name,source) VALUES ($1,$2,'New relationship','Manual')",[lead.id,orgA]);
    assert.ok((await db.query('SELECT do_not_contact FROM public.crm_contacts')).rows.every(r=>r.do_not_contact));
  }));
  await t.test('foreign account cannot see private contacts, mutate the lead or forge contact ownership',async()=>auth(b,async()=>{
    assert.equal((await db.query('SELECT * FROM public.crm_contacts')).rows.length,0);
    assert.equal((await db.query('UPDATE public.leads SET title=\'stolen\' WHERE id=$1 RETURNING id',[lead.id])).rows.length,0);
    await assert.rejects(()=>db.query("INSERT INTO public.crm_contacts(lead_id,org_id,name,source) VALUES ($1,$2,'Forged','Manual')",[lead.id,orgB]),e=>e.code==='42501');
    await assert.rejects(()=>db.query('SELECT public.fn_crm_record_outcome_v1($1,$2,now(),\'research\',\'\',null,null,false)',[lead.id,id(40)]),e=>e.code==='42501');
  }));
  await t.test('anonymous roles cannot call CRM mutators or read contacts',async()=>asRole(db,'anon',null,async()=>{
    await assert.rejects(()=>db.query('SELECT public.fn_crm_add_property_v1($1)',[prop]),e=>e.code==='42501');
    await assert.rejects(()=>db.query('SELECT * FROM public.crm_contacts'),e=>e.code==='42501');
  }));
});

test('account export paginates past 1,000, excludes source receipts, and fails instead of silently omitting failed categories',async()=>{
  const {exportRows,collectCrmExport}=await import('../supabase/functions/_shared/accountExport.ts');
  const records=Array.from({length:1205},(_,i)=>({id:`lead-${i}`,created_by:id(1)}));
  const requests=[];let failTable='';
  const client={from(table){return {select(columns){const filters=[];let start=0,end=0;const q={eq(k,v){filters.push(['eq',k,v]);return q;},in(k,v){filters.push(['in',k,v]);return q;},order(){return q;},range(s,e){start=s;end=e;return q;},then(resolve){requests.push({table,columns,filters,start,end});
    if(table===failTable)return Promise.resolve({data:null,error:{code:'42501'}}).then(resolve);
    const rows=table==='leads'?records:table==='crm_contacts'?[{id:'c1',lead_id:'lead-0'},{id:'c2',lead_id:'foreign'}]:table==='lead_activities'?[{id:'a1',lead_id:'lead-0',activity_type:'note'},{id:'a2',lead_id:'lead-0',activity_type:'system',payload:{event:'source_snapshot_linked'}}]:[];
    const filtered=rows.filter(r=>filters.every(([op,k,v])=>op==='eq'?r[k]===v:v.includes(r[k])));
    return Promise.resolve({data:filtered.slice(start,end+1),error:null}).then(resolve);}};return q;}};}};
  const result=await collectCrmExport(client,id(1));assert.equal(result.leads.length,1205);assert.equal(result.contacts.length,1);assert.equal(result.activities.length,1);assert.equal(result.activities[0].activity_type,'note');
  assert.equal(requests.filter(r=>r.table==='leads').length,3);
  assert.ok(requests.filter(r=>r.table==='leads').every(r=>r.filters.some(([op,k,v])=>op==='eq'&&k==='created_by'&&v===id(1))));
  failTable='crm_contacts';await assert.rejects(()=>collectCrmExport(client,id(1)),/Could not export crm_contacts/);
  failTable='leads';await assert.rejects(()=>exportRows(client,'leads','id',q=>q),/No complete archive/);
});

test('migration preserves legacy due dates and permits later stage changes',async t=>{
 const db=await createTenancyDb();t.after(()=>db.close());
 const user=id(80),org=await newUser(db,user),prop=id(81),leadId=id(82);
 await db.query("INSERT INTO public.properties(id,address) VALUES ($1,'Legacy follow-up fixture')",[prop]);
 const stage=(await db.query('SELECT id FROM public.pipeline_stages WHERE org_id=$1 ORDER BY sort_order LIMIT 1',[org])).rows[0].id;
 await db.query("INSERT INTO public.leads(id,org_id,property_id,stage_id,created_by,next_follow_up_at) VALUES ($1,$2,$3,$4,$5,'2026-11-02T15:00Z')",[leadId,org,prop,stage,user]);
 await db.exec(await readFile(new URL('../supabase/migrations/20260924183021_snap_crm_workflow_v1.sql',import.meta.url),'utf8'));
 await asRole(db,'authenticated',user,async()=>{
  const before=(await db.query('SELECT next_action,next_follow_up_at FROM public.leads WHERE id=$1',[leadId])).rows[0];
  assert.equal(before.next_action,'Review saved follow-up');assert.equal(new Date(before.next_follow_up_at).toISOString(),'2026-11-02T15:00:00.000Z');
  await db.query('UPDATE public.leads SET stage_id=$1 WHERE id=$2',[stage,leadId]);
  const after=(await db.query('SELECT next_action,next_follow_up_at FROM public.leads WHERE id=$1',[leadId])).rows[0];assert.deepEqual(after,before);
 });
});
