import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadProfileReadiness, saveProfileName, ProfileUpdateError, profileReadinessMessage } from '../src/services/profileReadiness.ts';

const A='00000000-0000-4000-8000-000000000001';
const B='00000000-0000-4000-8000-000000000002';
const PROFILE='00000000-0000-4000-8000-000000000003';
const ORG='00000000-0000-4000-8000-000000000004';
const at='2026-09-08T00:00:00+00:00';

function gateway() {
  return {
    calls: [],
    user: {id:A,email:'fixture@example.invalid',email_confirmed_at:at,is_anonymous:false,
      user_metadata:{org_id:'FORGED',free_unlocks_remaining:1000}},
    profiles: [{id:PROFILE,user_id:A,org_id:ORG,full_name:'Synthetic account',created_at:at,
      email:'outdated@example.invalid',free_unlocks_remaining:1000}],
    organizations: [{id:ORG,name:'Synthetic organization'}],
    authError:null,profileError:null,orgError:null,writeError:null,
    writeRows:[{id:PROFILE}],
    async verifyUser(){this.calls.push(['auth']);return {user:this.user,error:this.authError};},
    async findProfiles(id,limit){this.calls.push(['profiles',id,limit]);return {data:this.profiles,error:this.profileError};},
    async findOrganizations(id,limit){this.calls.push(['organizations',id,limit]);return {data:this.organizations,error:this.orgError};},
    async updateName(id,user,name){this.calls.push(['update',id,user,name]);return {data:this.writeRows,error:this.writeError};},
  };
}

test('ready requires verified user and exact database profile/organization; no metadata profile or financial fields',async()=>{
  const g=gateway(),r=await loadProfileReadiness(g,A);
  assert.equal(r.status,'ready');assert.equal(r.profile.email,'fixture@example.invalid');
  assert.deepEqual(g.calls,[['auth'],['profiles',A,2],['organizations',ORG,2]]);
  assert.equal(r.profile.org_id,ORG);assert.equal('free_unlocks_remaining' in r.profile,false);
  assert.equal('user_metadata' in r.profile,false);
});

test('invalid identity, missing session and changed account stop before profile queries',async()=>{
  const invalid=gateway();assert.equal((await loadProfileReadiness(invalid,'not-a-user')).status,'signed_out');assert.equal(invalid.calls.length,0);
  for(const user of [null,{id:A,is_anonymous:true},{id:B,email:'other@example.invalid',email_confirmed_at:at}]){
    const g=gateway();g.user=user;const r=await loadProfileReadiness(g,A);
    assert.notEqual(r.status,'ready');assert.deepEqual(g.calls,[['auth']]);
  }
});

test('authentication failure does not use cached metadata or fetch records',async()=>{
  const g=gateway();g.authError=new Error('PRIVATE AUTH DETAIL');
  const r=await loadProfileReadiness(g,A);assert.equal(r.status,'unavailable');
  assert.equal(JSON.stringify(r).includes('PRIVATE'),false);assert.deepEqual(g.calls,[['auth']]);
});

test('email must be confirmed before reading account details',async()=>{
  for(const confirmed of [null,'','not-a-date']){
    const g=gateway();g.user.email_confirmed_at=confirmed;
    assert.equal((await loadProfileReadiness(g,A)).status,'email_unverified');assert.equal(g.calls.length,1);
  }
});

test('missing profile stays missing despite complete Auth metadata',async()=>{
  const g=gateway();g.profiles=[];
  const r=await loadProfileReadiness(g,A);assert.equal(r.status,'profile_missing');
  assert.equal(r.profile,null);assert.equal(r.organization,null);assert.equal(g.calls.length,2);
});

test('duplicate profiles fail closed and do not select the first',async()=>{
  const g=gateway();g.profiles.push({...g.profiles[0],id:B});
  assert.equal((await loadProfileReadiness(g,A)).status,'profile_ambiguous');assert.equal(g.calls.length,2);
});

test('bad or foreign profile identity cannot select an organization',async()=>{
  for(const change of [{user_id:B},{org_id:''},{id:''},{created_at:'invented'},{full_name:{label:'bad'}}]){
    const g=gateway();Object.assign(g.profiles[0],change);
    assert.equal((await loadProfileReadiness(g,A)).status,'profile_invalid');assert.equal(g.calls.length,2);
  }
});

test('profile query errors and malformed shapes return no partial profile',async()=>{
  for(const data of [null,{},'[]']){
    const g=gateway();g.profiles=data;assert.equal((await loadProfileReadiness(g,A)).status,'unavailable');
  }
  const g=gateway();g.profileError={message:'PRIVATE SQL DETAILS'};
  const r=await loadProfileReadiness(g,A);assert.equal(r.profile,null);assert.equal(JSON.stringify(r).includes('PRIVATE'),false);
});

test('organization must resolve exactly once and match the verified profile',async()=>{
  for(const [data,status] of [[[],'organization_missing'],[[{id:B,name:'Other'}],'organization_missing'],
    [[{id:ORG,name:'One'},{id:ORG,name:'Two'}],'organization_ambiguous']]){
    const g=gateway();g.organizations=data;const r=await loadProfileReadiness(g,A);assert.equal(r.status,status);assert.equal(r.profile,null);
  }
});

test('thrown gateway errors are redacted and produce unavailable',async()=>{
  const g=gateway();g.findOrganizations=async()=>{throw new Error('PRIVATE CONNECTION VALUE');};
  const r=await loadProfileReadiness(g,A);assert.equal(r.status,'unavailable');assert.equal(JSON.stringify(r).includes('PRIVATE'),false);
});

test('name update revalidates and targets the exact profile AND verified user',async()=>{
  const g=gateway();await saveProfileName(g,A,PROFILE,'  New Name  ');
  assert.deepEqual(g.calls,[['auth'],['profiles',A,2],['organizations',ORG,2],['update',PROFILE,A,'New Name']]);
});

test('invalid names never authenticate or write',async()=>{
  for(const name of ['', ' ', 'x'.repeat(201),'line\nname','null\0name',null,{}]){
    const g=gateway();await assert.rejects(saveProfileName(g,A,PROFILE,name),ProfileUpdateError);assert.equal(g.calls.length,0);
  }
});

test('stale account or changed profile refuses name update',async()=>{
  for(const change of [g=>{g.user.id=B;},g=>{g.profiles=[];},g=>{g.profiles.push({...g.profiles[0]});},g=>{g.profiles[0].id=B;}]){
    const g=gateway();change(g);await assert.rejects(saveProfileName(g,A,PROFILE,'Name'),ProfileUpdateError);
    assert.equal(g.calls.some(c=>c[0]==='update'),false);
  }
});

test('missing, duplicate and failed write receipts are not reported as success or retried',async()=>{
  for(const rows of [[],null,[{id:B}],[{id:PROFILE},{id:PROFILE}]]){
    const g=gateway();g.writeRows=rows;
    await assert.rejects(saveProfileName(g,A,PROFILE,'Name'),ProfileUpdateError);
    assert.equal(g.calls.filter(c=>c[0]==='update').length,1);
  }
  const g=gateway();g.writeError=new Error('PRIVATE WRITE DETAILS');
  await assert.rejects(saveProfileName(g,A,PROFILE,'Name'),e=>e instanceof ProfileUpdateError&&!e.message.includes('PRIVATE'));
});

test('user-facing blocker copy has no backend error details',()=>{
  for(const state of ['signed_out','session_changed','email_unverified','profile_missing','profile_ambiguous','profile_invalid','organization_missing','organization_ambiguous','unavailable']){
    const text=profileReadinessMessage(state);assert.ok(text.length>10);assert.doesNotMatch(text,/SQL|Supabase|UUID|credentials/i);
  }
});

test('the hook uses a user-scoped key and native Auth reset without the missing Edge function',()=>{
  const source=readFileSync(new URL('../src/hooks/useProfileSettings.ts',import.meta.url),'utf8');
  assert.match(source,/\["profile-settings", userId\]/);assert.doesNotMatch(source,/getSession\(|send-password-reset/);
  assert.match(source,/resetPasswordForEmail\(fresh\.profile\.email/);
  assert.match(source,/query\.data\.profile\.user_id === userId/);
});
