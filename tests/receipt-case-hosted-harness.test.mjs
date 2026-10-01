import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {validateConfig,validateState,parseArguments,buildSyntheticScopes,registrationSql,createRuntime,requireCustomerDenied,requirePrivateLeadReadback} from '../scripts/tests/release-hosted-source/hosted.mjs';
const id=n=>`77777777-7777-4777-8777-${String(n).padStart(12,'0')}`;
const sha=text=>createHash('sha256').update(text).digest('hex');
// Fresh throwaway shape fixtures for mocked HTTP only; no credential is stored
// in this test or provisioned in any project.
const config=()=>({project_ref:'abcdefghijklmnopqrst',expected_fixture_nonce:id(1),anon_key:`sb_publishable_${randomBytes(32).toString('base64url')}`,service_role_key:`sb_secret_${randomBytes(32).toString('base64url')}`,operator_authority_reference_sha256:sha('Synthetic authorization reference only')});
const state=cfg=>({version:1,kind:'receipt_case_hosted_synthetic_proof',run_id:id(2),seed:98765,project_ref:cfg.project_ref,fixture_nonce:cfg.expected_fixture_nonce,
 authority_reference_sha256:cfg.operator_authority_reference_sha256,scopes:buildSyntheticScopes(98765,id(2)),commands:{grant_initial:id(3),grant_refresh:id(4)},
 accounts:Object.fromEntries(['O','A','B'].map((label,i)=>[label,{id:id(20+i),email:`synthetic-receipt-${label.toLowerCase()}-${id(2)}@example.invalid`,password:'SyntheticPasswordThatIsNotARealCredential0000!'}])),completed:{},checks:[],pending:[],requests:0});
const response=(data,status=200)=>({ok:status>=200&&status<300,status,text:async()=>JSON.stringify(data)});
const errorCode=code=>error=>error?.code===code;

test('private lead baseline requires every requested field before preservation can pass',()=>{
 const patch={title:'Synthetic private title',notes:'Synthetic notes',stage_id:id(50),priority:3,next_action:'Synthetic task',next_follow_up_at:'2026-09-25T12:00:00.000Z',estimated_value:250000,estimated_repairs:15000,offer_amount:200000,contract_deadline:'2026-12-31',contact_restricted:true};
 const row={id:id(51),...patch,next_follow_up_at:'2026-09-25T12:00:00+00:00'};
 assert.equal(requirePrivateLeadReadback([row],id(51),patch),row);
 for(const key of Object.keys(patch)){
  const changed={...row};delete changed[key];assert.throws(()=>requirePrivateLeadReadback([changed],id(51),patch),errorCode('PRIVATE_LEAD_CHANGED_INPUT'));
 }
 assert.throws(()=>requirePrivateLeadReadback([{...row,contact_restricted:false}],id(51),patch),errorCode('PRIVATE_LEAD_CHANGED_INPUT'));
 assert.throws(()=>requirePrivateLeadReadback([{...row,next_follow_up_at:'2026-09-25T12:00:01Z'}],id(51),patch),errorCode('PRIVATE_LEAD_CHANGED_INPUT'));
 assert.throws(()=>requirePrivateLeadReadback([],id(51),patch),errorCode('PRIVATE_LEAD_WRITE_UNCONFIRMED'));
});

test('hosted source harness accepts only explicit phases and exact private configuration fields',()=>{
 const cfg=config();assert.equal(validateConfig(cfg).project_ref,cfg.project_ref);
 for(const mutation of [c=>{c.extra=true;},c=>{c.project_ref='https://example.invalid';},c=>{c.expected_fixture_nonce='not-a-nonce';},c=>{c.operator_authority_reference_sha256='not-a-hash';},c=>{c.service_role_key=c.anon_key;}]){
  const bad=config();mutation(bad);assert.throws(()=>validateConfig(bad));
 }
 assert.deepEqual(parseArguments(['--help']),{help:true});
 assert.deepEqual(parseArguments(['initial','--config','/private/config.json','--state','/private/state.json']),{phase:'initial',config:'/private/config.json',state:'/private/state.json'});
 for(const args of [['deploy'],['initial','--config','relative.json','--state','/private/state.json'],['initial','--config','/private/x','--state','/private/x'],['refresh','--config','/private/x','--config','/private/y','--state','/private/z']])assert.throws(()=>parseArguments(args));
});

test('synthetic fixture and root-only SQL bind the exact scope, authority reference and nonce without executing SQL',()=>{
 const cfg=config(),saved=state(cfg);assert.equal(validateState(saved,cfg),saved);
 const first=saved.scopes.initial,second=saved.scopes.refresh;
 assert.equal(first.snapshot.evidence_kind,'synthetic');assert.equal(second.snapshot.parent_snapshot_id,first.snapshot.id);
 assert.equal(new Set(first.records.map(r=>r.source_property_key)).size,3);
 assert.equal(new Set(first.records.map(r=>r.source_parcel_reference)).size,1);
 assert.deepEqual(first.records.map(r=>r.record_key),second.records.map(r=>r.record_key));
 assert.notEqual(first.snapshot.original_sha256,second.snapshot.original_sha256);
 const sql=registrationSql(cfg,saved,'initial');
 assert.ok(sql.includes(cfg.expected_fixture_nonce));assert.ok(sql.includes(cfg.operator_authority_reference_sha256));
 assert.match(sql,/current_user<>'postgres'/);assert.match(sql,/snap_receipt\.register_snapshot/);assert.match(sql,/snap_receipt\.grant_authority/);
 assert.doesNotMatch(sql,/fn_accept_receipt_case_snapshot|fn_review_receipt_case_snapshot/);
 assert.ok(!sql.includes(cfg.anon_key)&&!sql.includes(cfg.service_role_key)&&!sql.includes(saved.accounts.O.password));
 const changed=structuredClone(saved);changed.scopes.initial.records[0].address='Changed input';assert.throws(()=>validateState(changed,cfg));
});

test('hosted denial assertions never treat missing routes, expired JWTs or internal errors as isolation passes',()=>{
 requireCustomerDenied({status:403,data:{code:'42501'}});
 for(const value of [{status:401,data:{code:'42501'}},{status:403,data:{code:'PGRST301'}},{status:404,data:{code:'42501'}},{status:500,data:{code:'42501'}},{status:200,data:{code:'42501'}}])assert.throws(()=>requireCustomerDenied(value));
});

test('all HTTP writes and out-of-scope endpoints are blocked before a verified staging marker',async()=>{
 const cfg=config(),saved=state(cfg),calls=[];
 const runtime=createRuntime(cfg,saved,async()=>{}, {fetchImpl:async(...args)=>{calls.push(args);return response({});}});
 await assert.rejects(()=>runtime.request('/auth/v1/admin/users',{admin:true,method:'POST',body:{}}),errorCode('STAGING_BOUNDARY_REQUIRED'));
 await assert.rejects(()=>runtime.request('/rest/v1/rpc/send-sms',{method:'POST',body:{}}),errorCode('API_ENDPOINT_OUT_OF_SCOPE'));
 await assert.rejects(()=>runtime.request('https://unrelated.invalid',{method:'GET'}),errorCode('API_PATH_INVALID'));
 await assert.rejects(()=>runtime.request('//unrelated.invalid',{method:'GET'}),errorCode('API_PATH_INVALID'));
 assert.equal(calls.length,0);
});

test('wrong nonce or enabled checkout fails before any account mutation',async()=>{
 for(const mode of ['wrong_nonce','checkout_enabled']){
  const cfg=config(),saved=state(cfg),calls=[];
  const runtime=createRuntime(cfg,saved,async()=>{}, {fetchImpl:async(url,options)=>{
   calls.push({url,method:options.method});
   return response(url.includes('/snap_hosted_fixture')?[{kind:'snap_hosted_synthetic',schema_version:1,fixture_nonce:mode==='wrong_nonce'?id(99):cfg.expected_fixture_nonce,state:'ready'}]:true);
  }});
  await assert.rejects(()=>runtime.verifyBoundary(),errorCode(mode==='wrong_nonce'?'STAGING_MARKER_MISMATCH':'CHECKOUT_MUST_REMAIN_HELD'));
  await assert.rejects(()=>runtime.request('/auth/v1/admin/users',{admin:true,method:'POST',body:{}}),errorCode('STAGING_BOUNDARY_REQUIRED'));
  assert.ok(calls.every(c=>!c.url.includes('/auth/')));
 }
});

test('verified boundary still restricts service authority to exact fixture account creation and rejects raw SQL/provider access',async()=>{
 const cfg=config(),saved=state(cfg),calls=[];
 const runtime=createRuntime(cfg,saved,async()=>{}, {fetchImpl:async(url,options)=>{
  calls.push({url,options});
  return response(url.includes('/snap_hosted_fixture')?[{kind:'snap_hosted_synthetic',schema_version:1,fixture_nonce:cfg.expected_fixture_nonce,state:'ready'}]:false);
 }});
 await runtime.verifyBoundary();assert.equal(calls.length,2);
 assert.ok(calls.every(c=>new URL(c.url).origin===`https://${cfg.project_ref}.supabase.co`&&c.options.redirect==='error'));
 await assert.rejects(()=>runtime.request('/auth/v1/admin/users',{admin:true,method:'POST',body:{email:'unrelated@example.invalid',email_confirm:true}}),errorCode('SYNTHETIC_AUTH_CREATE_REQUIRED'));
 await assert.rejects(()=>runtime.request('/rest/v1/leads',{admin:true,method:'POST',body:{}}),errorCode('ADMIN_OPERATION_OUT_OF_SCOPE'));
 await assert.rejects(()=>runtime.request('/rest/v1/rpc/register_snapshot',{admin:true,method:'POST',body:{}}),errorCode('API_ENDPOINT_OUT_OF_SCOPE'));
 await assert.rejects(()=>runtime.request('/functions/v1/send-sms',{method:'POST',body:{}}),errorCode('API_ENDPOINT_OUT_OF_SCOPE'));
 assert.equal(calls.length,2);
});
