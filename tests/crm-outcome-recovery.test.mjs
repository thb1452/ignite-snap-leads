import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTenancyDb,asRole,newUser} from './helpers/tenancy-db.mjs';
import {CRM_OUTCOME_STORAGE_KEY,CRM_OUTCOME_TTL_MS,readOutcomeRecovery,saveOutcomeAttempt,clearOutcomeAttempt} from '../src/services/crmOutcomeRecovery.ts';
const id=n=>`33333333-3333-4333-8333-${String(n).padStart(12,'0')}`;
function sessionStore(){const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};}
const command=()=>({leadId:id(2),requestId:id(3),expected:'2026-09-24T19:00:00Z',outcome:'research',note:'Private manual work',nextAction:'Check source',dueAt:'2026-10-01T19:00:00Z',completeAction:true});
test('reload keeps the exact request, rejects changed drafts and hides another account or lead',()=>{
 const store=sessionStore(),actor=id(1),cmd=command();saveOutcomeAttempt(store,actor,cmd);
 const reload=readOutcomeRecovery(store,actor,cmd.leadId);assert.equal(reload.status,'pending');assert.deepEqual(reload.saved.command,cmd);
 assert.deepEqual(saveOutcomeAttempt(store,actor,cmd),reload.saved);
 assert.throws(()=>saveOutcomeAttempt(store,actor,{...cmd,note:'Changed draft'}),/Reconcile/);
 const otherLead=readOutcomeRecovery(store,actor,id(4));assert.deepEqual(otherLead,{status:'other_lead',leadId:cmd.leadId});assert.ok(!JSON.stringify(otherLead).includes(cmd.note));
 const otherAccount=readOutcomeRecovery(store,id(5),cmd.leadId);assert.deepEqual(otherAccount,{status:'foreign'});assert.ok(store.getItem(CRM_OUTCOME_STORAGE_KEY));
});
test('TTL removes draft text but keeps blocking receipt pointer; malformed and unavailable storage fail closed',()=>{
 const store=sessionStore(),actor=id(1),cmd=command(),now=Date.now();saveOutcomeAttempt(store,actor,cmd,now);
 const expired=readOutcomeRecovery(store,actor,cmd.leadId,now+CRM_OUTCOME_TTL_MS+1);assert.equal(expired.status,'expired');assert.equal(expired.saved.requestId,cmd.requestId);
 assert.ok(!store.getItem(CRM_OUTCOME_STORAGE_KEY).includes(cmd.note));assert.ok(!store.getItem(CRM_OUTCOME_STORAGE_KEY).includes(cmd.nextAction));
 assert.throws(()=>saveOutcomeAttempt(store,actor,cmd),/Reconcile/);clearOutcomeAttempt(store,actor,cmd.leadId,id(9));assert.ok(store.getItem(CRM_OUTCOME_STORAGE_KEY));
 clearOutcomeAttempt(store,actor,cmd.leadId,cmd.requestId);assert.equal(store.getItem(CRM_OUTCOME_STORAGE_KEY),null);
 store.setItem(CRM_OUTCOME_STORAGE_KEY,'broken');assert.equal(readOutcomeRecovery(store,actor,cmd.leadId).status,'invalid');
 store.removeItem(CRM_OUTCOME_STORAGE_KEY);
 const broken={...store,setItem:()=>{throw new Error('quota');}};assert.throws(()=>saveOutcomeAttempt(broken,actor,cmd),/No outcome was submitted/);
});
test('lost acknowledgement followed by reload retries one actual PostgreSQL outcome without duplicate history',async t=>{
 const db=await createTenancyDb();t.after(()=>db.close());await db.exec(await readFile(new URL('../supabase/migrations/20260924183021_snap_crm_workflow_v1.sql',import.meta.url),'utf8'));
 const actor=id(20),org=await newUser(db,actor),prop=id(21),leadId=id(22),store=sessionStore();
 await db.query("INSERT INTO public.properties(id,address) VALUES ($1,'Recovery fixture')",[prop]);
 const stage=(await db.query('SELECT id FROM public.pipeline_stages WHERE org_id=$1 ORDER BY sort_order LIMIT 1',[org])).rows[0].id;
 await db.query('INSERT INTO public.leads(id,org_id,property_id,stage_id,created_by) VALUES ($1,$2,$3,$4,$5)',[leadId,org,prop,stage,actor]);
 await asRole(db,'authenticated',actor,async()=>{
  const lead=(await db.query('SELECT * FROM public.leads WHERE id=$1',[leadId])).rows[0];
  const cmd={...command(),leadId,expected:new Date(lead.updated_at).toISOString(),requestId:id(23)};
  saveOutcomeAttempt(store,actor,cmd);
  const run=c=>db.query('SELECT (public.fn_crm_record_outcome_v1($1,$2,$3,$4,$5,$6,$7,$8)).*',[c.leadId,c.requestId,c.expected,c.outcome,c.note,c.nextAction,c.dueAt,c.completeAction]);
  await run(cmd); // Database commits, but the browser never receives acknowledgement.
  const reload=readOutcomeRecovery(store,actor,leadId);assert.equal(reload.status,'pending');
  const retry=(await run(reload.saved.command)).rows[0];assert.equal(retry.next_action,cmd.nextAction);
  assert.equal((await db.query('SELECT count(*)::int n FROM public.lead_activities WHERE id=$1',[cmd.requestId])).rows[0].n,1);
  clearOutcomeAttempt(store,actor,leadId,cmd.requestId);assert.equal(readOutcomeRecovery(store,actor,leadId).status,'none');
 });
});

test('late account A completion cannot erase account B recovery',()=>{
 const store=sessionStore(),a=id(1),b=id(5),old=command();saveOutcomeAttempt(store,a,old);
 // Actual auth transition purges old state, then B starts their own action.
 store.removeItem(CRM_OUTCOME_STORAGE_KEY);const next={...command(),leadId:id(6),requestId:id(7),note:'B private'};saveOutcomeAttempt(store,b,next);
 clearOutcomeAttempt(store,a,old.leadId,old.requestId);assert.equal(readOutcomeRecovery(store,b,next.leadId).status,'pending');
 assert.deepEqual(readOutcomeRecovery(store,b,next.leadId).saved.command,next);
});
