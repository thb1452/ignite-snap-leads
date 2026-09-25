import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTenancyDb,asRole,newUser} from './helpers/tenancy-db.mjs';

const id=n=>`77777777-7777-4777-8777-${String(n).padStart(12,'0')}`;
const read=name=>readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8');
const signature='public.fn_crm_record_outcome_v1(uuid,uuid,timestamptz,text,text,text,timestamptz,boolean)';
const initial='20260924183021_snap_crm_workflow_v1.sql';
const additive='20260924214048_snap_crm_outcome_conflict_v1.sql';

test('additive conflict migration preserves old receipt replay, data, ACL and invoker authority',async t=>{
 const db=await createTenancyDb();t.after(()=>db.close());
 await db.exec(await read(initial));
 const actor=id(1),org=await newUser(db,actor),property=id(2),lead=id(3),request=id(4);
 await db.query("INSERT INTO public.properties(id,address) VALUES ($1,'Synthetic migration fixture')",[property]);
 const stage=(await db.query('SELECT id FROM public.pipeline_stages WHERE org_id=$1 ORDER BY sort_order LIMIT 1',[org])).rows[0].id;
 await db.query('INSERT INTO public.leads(id,org_id,property_id,stage_id,created_by) VALUES ($1,$2,$3,$4,$5)',[lead,org,property,stage,actor]);
 const expected=(await db.query('SELECT updated_at FROM public.leads WHERE id=$1',[lead])).rows[0].updated_at;
 const command=[lead,request,expected,'research','Preserve pre-upgrade outcome','Review fixture','2030-01-01T00:00:00Z',false];
 const invoke=args=>asRole(db,'authenticated',actor,()=>db.query('SELECT (public.fn_crm_record_outcome_v1($1,$2,$3,$4,$5,$6,$7,$8)).*',args));
 await invoke(command);
 const contents=async()=>({lead:(await db.query('SELECT * FROM public.leads WHERE id=$1',[lead])).rows,history:(await db.query('SELECT * FROM public.lead_activities WHERE lead_id=$1 ORDER BY id',[lead])).rows});
 const authority=async()=>(await db.query('SELECT proowner,proacl::text,prosecdef,proconfig,provolatile FROM pg_proc WHERE oid=$1::regprocedure',[signature])).rows[0];
 const before=await contents(), permissions=await authority();
 await db.exec(await read(additive));await db.exec(await read(additive));
 assert.deepEqual(await authority(),permissions);assert.deepEqual(await contents(),before);
 await invoke(command);assert.deepEqual(await contents(),before,'A pre-upgrade committed receipt must still replay without writing');
 const conflict=[...command];conflict[1]=id(5);
 await assert.rejects(()=>invoke(conflict),error=>error.code==='PT409'&&error.message==='Lead changed. Refresh before recording this outcome.');
 assert.deepEqual(await contents(),before,'Conflict cannot leave partial work or change the saved lead');
 const changed=[...command];changed[4]='Changed command';
 await assert.rejects(()=>invoke(changed),error=>error.code==='22023');
 for(const role of ['anon','service_role'])await asRole(db,role,null,async()=>{
  await assert.rejects(()=>db.query('SELECT public.fn_crm_record_outcome_v1($1,$2,$3,$4,$5,$6,$7,$8)',command),error=>error.code==='42501');
 });
});

test('additive conflict migration refuses unexpected function body drift',async t=>{
 const db=await createTenancyDb();t.after(()=>db.close());await db.exec(await read(initial));
 const original=(await db.query('SELECT pg_get_functiondef($1::regprocedure) definition',[signature])).rows[0].definition;
 const drifted=original.replace('Restore this lead before recording work','Unreviewed replacement body');
 assert.notEqual(drifted,original);await db.exec(drifted);
 await assert.rejects(async()=>db.exec(await read(additive)),/baseline drift/);
 await db.exec('ROLLBACK');
 const after=(await db.query('SELECT pg_get_functiondef($1::regprocedure) definition',[signature])).rows[0].definition;
 assert.equal(after,drifted);
});
