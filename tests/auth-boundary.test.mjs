import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import { createAuthBoundary, hasAllowedRole } from '../src/lib/authBoundary.ts';
import { clearSessionData } from '../src/lib/clearSessionData.ts';

const turn = () => new Promise(resolve => setTimeout(resolve, 0));
const deferred = () => { let resolve, reject; const promise = new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject}; };

test('VA and ordinary customers cannot enter admin routes; explicit allowed roles govern access', () => {
  for (const roles of [[], ['user'], ['va'], ['user','va']]) assert.equal(hasAllowedRole(roles,['admin']),false);
  assert.equal(hasAllowedRole(['admin'], ['admin']), true);
  assert.equal(hasAllowedRole(['va'], ['admin','va']), true);
  assert.equal(hasAllowedRole(['user'], ['admin','user']), true);
  assert.equal(hasAllowedRole(['admin'], []), false);
});

test('switching A to B discards late A permissions and clears data before B is exposed', async () => {
  const requests = new Map(); const events = []; let state;
  const boundary = createAuthBoundary({
    loadRoles: (id,signal) => { const d=deferred();requests.set(id,{...d,signal}); return d.promise; },
    clearSessionData: () => events.push('clear'),
    onChange: s => {state=s;events.push(s.user?.id??'signed-out');},
  });
  boundary.apply({id:'A'}); await turn();
  boundary.apply({id:'B'}); await turn();
  assert.deepEqual(events.slice(0,4),['clear','A','clear','B']);
  assert.equal(requests.get('A').signal.aborted,true);
  requests.get('B').resolve(['user']); await turn();
  requests.get('A').resolve(['admin']); await turn();
  assert.equal(state.user.id,'B'); assert.deepEqual(state.roles,['user']);
  boundary.dispose();
});

test('logout clears permissions immediately even if an old role lookup later succeeds', async () => {
  const d=deferred(); let state;
  const boundary=createAuthBoundary({loadRoles:()=>d.promise,clearSessionData:()=>{},onChange:s=>state=s});
  boundary.apply({id:'A'}); await turn();boundary.apply(null);
  d.resolve(['admin']);await turn();
  assert.equal(state.user,null);assert.deepEqual(state.roles,[]);assert.equal(state.loading,false);
  boundary.dispose();
});

test('permission failure and timeout fail closed without trusting an old role', async () => {
  let state;let reject=false;
  const boundary=createAuthBoundary({timeoutMs:10,loadRoles:async()=>{if(reject)throw Error('offline');return new Promise(()=>{});},clearSessionData:()=>{},onChange:s=>state=s});
  boundary.apply({id:'A'}); await new Promise(resolve=>setTimeout(resolve,25));
  assert.deepEqual(state.roles,[]);assert.equal(state.loading,false);assert.ok(state.error);
  reject=true;boundary.apply({id:'A'});await turn();await turn();
  assert.deepEqual(state.roles,[]);assert.ok(state.error);
  boundary.dispose();
});

test('refresh replaces revoked roles instead of using stored roles', async () => {
  let roles=['admin'];let state;
  const boundary=createAuthBoundary({loadRoles:async()=>roles,clearSessionData:()=>{},onChange:s=>state=s});
  boundary.apply({id:'A'});await turn();assert.deepEqual(state.roles,['admin']);
  roles=['user'];boundary.apply({id:'A'});assert.deepEqual(state.roles,[]);
  await turn();assert.deepEqual(state.roles,['user']);boundary.dispose();
});

test('role calls are deferred outside auth callbacks; disposed provider ignores completions', async () => {
  let called=false;let changes=0;const d=deferred();
  const boundary=createAuthBoundary({loadRoles:()=>{called=true;return d.promise;},clearSessionData:()=>{},onChange:()=>changes++});
  boundary.apply({id:'A'});assert.equal(called,false);await turn();assert.equal(called,true);
  boundary.dispose();d.resolve(['admin']);await turn();assert.equal(changes,1);
});

test('late private query cannot repopulate cleared account cache; session flags are removed', async () => {
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});const d=deferred();
  client.setQueryData(['crm-leads'],[{private:'A'}]);
  const late=client.fetchQuery({queryKey:['crm-lead','old'],queryFn:()=>d.promise}).catch(()=>{});
  const removed=[];clearSessionData(client,[{removeItem:key=>removed.push(key)}]);
  client.setQueryData(['crm-leads','B'],[{private:'B'}]);d.resolve({private:'A'});await late;await turn();
  assert.equal(client.getQueryData(['crm-leads']),undefined);
  assert.equal(client.getQueryData(['crm-lead','old']),undefined);
  assert.deepEqual(client.getQueryData(['crm-leads','B']),[{private:'B'}]);
  assert.ok(removed.includes('snap_user_roles_cache'));assert.ok(removed.includes('snap_checkout_processed'));
  client.clear();
});

test('first same-user hydration preserves exact pending outcome without renewing TTL; switch/logout/failure purge it',async()=>{
  const {CRM_OUTCOME_STORAGE_KEY,CRM_OUTCOME_TTL_MS,saveOutcomeAttempt,readOutcomeRecovery}=await import('../src/services/crmOutcomeRecovery.ts');
  const a='44444444-4444-4444-8444-000000000001',b='44444444-4444-4444-8444-000000000002',lead='44444444-4444-4444-8444-000000000003';
  const cmd={leadId:lead,requestId:'44444444-4444-4444-8444-000000000004',expected:'2026-09-24T19:00Z',outcome:'research',note:'A private note',nextAction:null,dueAt:null,completeAction:false};
  const data=new Map(),store={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  const client=new QueryClient();const created=Date.now()-1000;saveOutcomeAttempt(store,a,cmd,created);const exact=store.getItem(CRM_OUTCOME_STORAGE_KEY);
  let fail=false;const contexts=[];
  const boundary=createAuthBoundary({loadRoles:async()=>{if(fail)throw new Error('offline');return ['user'];},clearSessionData:actor=>{contexts.push(actor);clearSessionData(client,[store],actor,store);},onChange:()=>{}});
  boundary.apply({id:a});await turn();assert.equal(store.getItem(CRM_OUTCOME_STORAGE_KEY),exact);assert.equal(readOutcomeRecovery(store,a,lead).saved.createdAt,created);
  boundary.apply({id:b});await turn();assert.equal(store.getItem(CRM_OUTCOME_STORAGE_KEY),null);assert.deepEqual(contexts.slice(0,2),[a,undefined]);
  saveOutcomeAttempt(store,b,cmd);boundary.apply(null);assert.equal(store.getItem(CRM_OUTCOME_STORAGE_KEY),null);
  boundary.apply({id:a});await turn();saveOutcomeAttempt(store,a,cmd);fail=true;boundary.apply({id:a});await turn();await turn();assert.equal(store.getItem(CRM_OUTCOME_STORAGE_KEY),null);
  boundary.dispose();client.clear();
  // Expired same-account state retains only a receipt pointer, never the text.
  const old=Date.now()-CRM_OUTCOME_TTL_MS-1000;saveOutcomeAttempt(store,a,cmd,old);clearSessionData(client,[store],a,store);
  const expired=readOutcomeRecovery(store,a,lead);assert.equal(expired.status,'expired');assert.equal(expired.saved.createdAt,old);assert.ok(!store.getItem(CRM_OUTCOME_STORAGE_KEY).includes(cmd.note));
  clearSessionData(client,[store]);assert.equal(store.getItem(CRM_OUTCOME_STORAGE_KEY),null);
});

test('initial signed-out or wrong-user hydration and malformed recovery never preserve draft data',async()=>{
  const {CRM_OUTCOME_STORAGE_KEY,saveOutcomeAttempt}=await import('../src/services/crmOutcomeRecovery.ts');
  const a='55555555-5555-4555-8555-000000000001',b='55555555-5555-4555-8555-000000000002';
  const cmd={leadId:'55555555-5555-4555-8555-000000000003',requestId:'55555555-5555-4555-8555-000000000004',expected:'2026-09-24T19:00Z',outcome:'research',note:'A private note',nextAction:null,dueAt:null,completeAction:false};
  const data=new Map(),store={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},client=new QueryClient();
  saveOutcomeAttempt(store,a,cmd);const signedOut=createAuthBoundary({loadRoles:async()=>['user'],clearSessionData:actor=>clearSessionData(client,[store],actor,store),onChange:()=>{}});signedOut.apply(null);assert.equal(store.getItem(CRM_OUTCOME_STORAGE_KEY),null);signedOut.dispose();
  saveOutcomeAttempt(store,a,cmd);clearSessionData(client,[store],b,store);assert.equal(store.getItem(CRM_OUTCOME_STORAGE_KEY),null);
  store.setItem(CRM_OUTCOME_STORAGE_KEY,JSON.stringify({actor:a,leadId:cmd.leadId,version:1,command:{note:'invalid'}}));clearSessionData(client,[store],a,store);assert.equal(store.getItem(CRM_OUTCOME_STORAGE_KEY),null);client.clear();
});

test('initial recovery preservation is restricted to the explicitly supplied per-tab store',async()=>{
 const {CRM_OUTCOME_STORAGE_KEY,saveOutcomeAttempt}=await import('../src/services/crmOutcomeRecovery.ts');
 const actor='66666666-6666-4666-8666-000000000001';
 const cmd={leadId:'66666666-6666-4666-8666-000000000002',requestId:'66666666-6666-4666-8666-000000000003',expected:'2026-09-24T19:00Z',outcome:'research',note:'Private',nextAction:null,dueAt:null,completeAction:false};
 const make=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
 const local=make(),session=make(),client=new QueryClient();saveOutcomeAttempt(local,actor,cmd);saveOutcomeAttempt(session,actor,cmd);
 clearSessionData(client,[local,session],actor,session);assert.equal(local.getItem(CRM_OUTCOME_STORAGE_KEY),null);assert.ok(session.getItem(CRM_OUTCOME_STORAGE_KEY));client.clear();
});
