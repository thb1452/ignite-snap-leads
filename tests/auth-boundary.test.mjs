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
