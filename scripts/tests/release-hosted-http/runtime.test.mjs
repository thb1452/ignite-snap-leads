import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,chmod,symlink,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateConfig,loadConfig,createRuntime,reserveReceipt,HarnessError,userAuthDenialLayer} from './runtime.mjs';

const fixture = () => ({version:1,kind:'snap_hosted_http_acceptance',project_ref:'abcdefghijklmnopqrst',api_url:'https://abcdefghijklmnopqrst.supabase.co',public_key:'sb_publishable_synthetic_test_key_1234567890',admin_key:'sb_secret_synthetic_test_key_1234567890',fixture_nonce:randomUUID(),run_id:randomUUID(),receipt_file:'/private-example/result.json',expected_commit:'a'.repeat(40),operator_approval:{scope:'isolated_synthetic_http',max_cost_usd:0,confirmed_new_blank_project:true},checkout_expectation:'configuration_closed'});
const marker = c => [{kind:'snap_hosted_synthetic',schema_version:1,fixture_nonce:c.fixture_nonce,state:'ready'}];
const response = (data,status=200) => new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
const token = `${Buffer.from('{"alg":"ES256"}').toString('base64url')}.${Buffer.from('{"sub":"synthetic"}').toString('base64url')}.synthetic`;

test('target configuration has no defaults or URL/key fallthrough', () => {
  for(const change of [{api_url:'http://abcdefghijklmnopqrst.supabase.co'},{api_url:'https://abcdefghijklmnopqrst.supabase.co/'},{api_url:'https://other.supabase.co'},{api_url:'https://user:secret@abcdefghijklmnopqrst.supabase.co'},{api_url:'https://abcdefghijklmnopqrst.supabase.co:443'},{api_url:'https://abcdefghijklmnopqrst.supabase.co?key=x'},{public_key:'sb_secret_synthetic_test_key_1234567890'},{operator_approval:{scope:'isolated_synthetic_http',max_cost_usd:1,confirmed_new_blank_project:true}},{fixture_nonce:null},{internal_worker_secret:'short'},{anything:'extra'}]) assert.throws(()=>validateConfig({...fixture(),...change}),HarnessError);
  assert.ok(validateConfig(fixture()));
});

test('private config and receipt reservation refuse repository, symlink, broad mode and reused run',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'snap-hosted-http-unit-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const repo=join(dir,'repo');await mkdir(repo,{mode:0o700});
  const config={...fixture(),receipt_file:join(dir,'result.json')};
  const file=join(dir,'config.json');await writeFile(file,JSON.stringify(config),{mode:0o600});
  assert.equal((await loadConfig(file,{repo})).api_url,config.api_url);
  await chmod(file,0o644);await assert.rejects(loadConfig(file,{repo}),/CONFIG_FILE_MUST_BE_PRIVATE/);await chmod(file,0o600);
  const link=join(dir,'link.json');await symlink(file,link);await assert.rejects(loadConfig(link,{repo}),/CONFIG_FILE_MUST_BE_PRIVATE/);
  const inRepo=join(repo,'config.json');await writeFile(inRepo,JSON.stringify(config),{mode:0o600});await assert.rejects(loadConfig(inRepo,{repo}),/PRIVATE_CONFIG_FILE_REQUIRED/);
  await writeFile(file,JSON.stringify({...config,receipt_file:join(repo,'result.json')}));await assert.rejects(loadConfig(file,{repo}),/OUTPUT_MUST_BE_OUTSIDE_REPOSITORY/);
  const save=await reserveReceipt(config);await save({status:'RUNNING'});await save({status:'PASS'});
  assert.deepEqual(JSON.parse(await readFile(config.receipt_file,'utf8')),{status:'PASS'});
  await assert.rejects(reserveReceipt(config),{code:'EEXIST'});
});

test('private marker is the first request and mismatch prevents all mutation',async()=>{
  const c=fixture(), calls=[];
  const runtime=createRuntime(c,{fetchImpl:async(url,options)=>{calls.push({url,options});return response([{...marker(c)[0],fixture_nonce:randomUUID()}]);}});
  await assert.rejects(runtime.request('/auth/v1/admin/users',{admin:true,method:'POST',body:{}}),/STAGING_MARKER_REQUIRED_BEFORE_REQUESTS/);
  assert.equal(calls.length,0);
  await assert.rejects(runtime.verifyBoundary(),/STAGING_MARKER_MISMATCH/);
  await assert.rejects(runtime.request('/rest/v1/properties',{admin:true,method:'POST',body:{}}),/STAGING_MARKER_REQUIRED_BEFORE_REQUESTS/);
  assert.equal(calls.length,1);assert.equal(calls[0].options.method,'GET');
});

test('modern admin/public keys never become bearer tokens; user JWT and host stay separate',async()=>{
  const c=fixture(), calls=[];
  const runtime=createRuntime(c,{fetchImpl:async(url,options)=>{calls.push({url,options});return response(url.includes('snap_hosted_fixture')?marker(c):[]);}});
  await runtime.verifyBoundary();
  assert.equal(calls[0].options.headers.apikey,c.admin_key);assert.equal(calls[0].options.headers.Authorization,undefined);
  await runtime.request('/rest/v1/leads?select=id',{token});
  assert.equal(calls[1].options.headers.apikey,c.public_key);assert.equal(calls[1].options.headers.Authorization,`Bearer ${token}`);assert.equal(calls[1].options.redirect,'error');
  await runtime.request('/rest/v1/leads?select=id');assert.equal(calls[2].options.headers.Authorization,undefined);
  for(const path of ['//evil.example/rest/v1/leads','/\\evil.example/rest/v1/leads','/rest/v1/%2e%2e/auth','https://evil.example','/rest/v1/leads#secret','/auth/v1/signup','/auth/v1/invite','/auth/v1/admin/generate_link']) await assert.rejects(runtime.request(path),HarnessError);
  await assert.rejects(runtime.request('/rest/v1/leads',{headers:{Authorization:'Bearer secret'}}),/HEADER_OVERRIDE_FORBIDDEN/);
  await assert.rejects(runtime.request('/rest/v1/leads',{token:c.admin_key}),/USER_TOKEN_MUST_BE_JWT/);
  assert.equal(calls.length,3);
});

test('synthetic ownership bounds administrative mutations and no automatic write retry occurs',async()=>{
  const c=fixture(), calls=[], userId=randomUUID(); let fail=false;
  const runtime=createRuntime(c,{fetchImpl:async(url,options)=>{
    calls.push({url,options});if(fail)throw new Error(`Simulated transport leak ${c.admin_key}`);
    return response(url.includes('snap_hosted_fixture')?marker(c):url.endsWith('/admin/users')?{id:userId}:{});
  }});
  await runtime.verifyBoundary();
  await assert.rejects(runtime.request(`/auth/v1/admin/users/${userId}`,{admin:true,method:'PUT',body:{ban_duration:'1h'}}),/SYNTHETIC_ADMIN_USER_ONLY/);
  await assert.rejects(runtime.request('/auth/v1/admin/users',{admin:true,method:'POST',body:{email:'real@example.com',email_confirm:true,user_metadata:{hosted_http_run:c.run_id}}}),/SYNTHETIC_ADMIN_CREATE_ONLY/);
  await runtime.request('/auth/v1/admin/users',{admin:true,method:'POST',body:{email:`synthetic-alpha-${c.run_id}@example.invalid`,email_confirm:true,password:'synthetic',user_metadata:{hosted_http_run:c.run_id}}});
  await runtime.request(`/auth/v1/admin/users/${userId}`,{admin:true,method:'PUT',body:{ban_duration:'1h'}});
  await assert.rejects(runtime.request('/rest/v1/unlocked_properties',{admin:true,method:'POST',body:{user_id:userId,property_id:randomUUID()}}),/SYNTHETIC_UNLOCK_REQUIRED/);
  await assert.rejects(runtime.request('/rest/v1/rpc/fn_apply_billing_event_v1',{admin:true,method:'POST',body:{}}),/ADMIN_REST_WRITE_OUT_OF_SCOPE/);
  fail=true;const before=calls.length;
  await assert.rejects(runtime.request('/rest/v1/rpc/fn_crm_record_outcome_v1',{token,method:'POST',body:{}}),error=>error instanceof HarnessError&&error.uncertain&&error.message==='HTTP_WRITE_OUTCOME_UNCERTAIN'&&!JSON.stringify(error).includes(c.admin_key));
  assert.equal(calls.length,before+1);
});

test('legacy fixture keys are project/role-bound and missing-header gateway probe omits bearer',async()=>{
  const c=fixture();const legacy=role=>`${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ref:c.project_ref,role})).toString('base64url')}.synthetic`;
  c.public_key=legacy('anon');c.admin_key=legacy('service_role');c.legacy_service_key=c.admin_key;
  assert.throws(()=>validateConfig({...c,admin_key:c.public_key}),/API_KEYS_INVALID/);
  const calls=[];const runtime=createRuntime(c,{fetchImpl:async(url,options)=>{calls.push(options);return response(url.includes('snap_hosted_fixture')?marker(c):{});}});
  await runtime.verifyBoundary();
  await runtime.request('/functions/v1/create-checkout-session',{token:'',method:'POST',body:{}});assert.equal(calls[1].headers.Authorization,undefined);
  await runtime.request('/functions/v1/test-pipeline',{legacyService:true,method:'POST',body:{}});assert.equal(calls[2].headers.Authorization,`Bearer ${c.admin_key}`);
  await assert.rejects(runtime.request('/rest/v1/rpc/fn_apply_billing_event_v1',{legacyService:true,method:'POST',body:{}}),/LEGACY_SERVICE_RETIRED_ENDPOINT_ONLY/);
  await assert.rejects(runtime.request('/functions/v1/test-pipeline',{legacyService:true,admin:true,method:'POST',body:{}}),/LEGACY_SERVICE_RETIRED_ENDPOINT_ONLY/);
  await assert.rejects(runtime.request('/rest/v1/rpc/fn_apply_billing_event_v1',{token:c.admin_key,method:'POST',body:{}}),/ADMIN_KEY_CANNOT_BE_USER_TOKEN/);
  assert.equal(calls.length,3);
});

test('unreadable or incomplete successful write acknowledgement is uncertain and never retried',async()=>{
  for (const body of ['not JSON',JSON.stringify({})]) {
    const c=fixture();let calls=0;
    const runtime=createRuntime(c,{fetchImpl:async(url)=>{calls++;return url.includes('snap_hosted_fixture')?response(marker(c)):new Response(body,{status:200});}});
    await runtime.verifyBoundary();
    await assert.rejects(runtime.request('/rest/v1/rpc/fn_crm_record_outcome_v1',{token,method:'POST',body:{}}),error=>error instanceof HarnessError&&error.uncertain);
    assert.equal(calls,2);
  }
  const c=fixture();const runtime=createRuntime(c,{fetchImpl:async(url)=>response(url.includes('snap_hosted_fixture')?marker(c):{})});await runtime.verifyBoundary();
  await assert.rejects(runtime.request('/auth/v1/admin/users',{admin:true,method:'POST',body:{email:`synthetic-alpha-${c.run_id}@example.invalid`,email_confirm:true,password:'synthetic',user_metadata:{hosted_http_run:c.run_id}}}),error=>error.code==='CREATED_USER_RESPONSE_UNCERTAIN'&&error.uncertain);
});

test('private operation journal precedes writes and preserves uncertain outcome identity without payload',async()=>{
  const c=fixture(), journal=[], requestId=randomUUID(),leadId=randomUUID();let calls=0;
  const runtime=createRuntime(c,{
    onOperation:async event=>{journal.push(event);},
    fetchImpl:async(url,options)=>{
      calls++;
      assert.equal(journal.at(-1).phase,'INTENT');
      if(url.includes('snap_hosted_fixture'))return response(marker(c));
      assert.equal(journal.at(-1).request_id,requestId);
      assert.equal(journal.at(-1).synthetic_lead_id,leadId);
      assert.equal(journal.at(-1).method,'POST');
      throw new Error(`Lost write response with ${c.admin_key}`);
    },
  });
  await runtime.verifyBoundary();
  await assert.rejects(runtime.request('/rest/v1/rpc/fn_crm_record_outcome_v1?unused=private-query-value',{token,method:'POST',body:{p_request_id:requestId,p_lead_id:leadId,p_note:'private-note-never-journal'}}),error=>error.uncertain);
  assert.equal(calls,2);
  assert.equal(journal.at(-1).phase,'UNCERTAIN');
  assert.equal(journal.at(-1).request_id,requestId);
  assert.equal(journal.at(-1).route,'/rest/v1/rpc/fn_crm_record_outcome_v1');
  const serialized=JSON.stringify(journal);
  for(const secret of [c.api_url,c.admin_key,c.public_key,token,'private-query-value','private-note-never-journal'])assert.ok(!serialized.includes(secret));
  let attempted=0;
  const blocked=createRuntime(c,{onOperation:async()=>{throw new Error('disk unavailable');},fetchImpl:async()=>{attempted++;return response(marker(c));}});
  await assert.rejects(blocked.verifyBoundary(),error=>error.code==='OPERATION_JOURNAL_WRITE_FAILED'&&!error.uncertain);
  assert.equal(attempted,0);
});

test('API key only handler rejection is distinct from forged JWT gateway proof',()=>{
  assert.equal(userAuthDenialLayer({status:401,data:{error:'Unauthorized'}}),'handler');
  assert.equal(userAuthDenialLayer({status:401,data:{code:401,message:'Invalid JWT'}}),'gateway');
  assert.equal(userAuthDenialLayer({status:401,data:{code:'UNAUTHORIZED_LEGACY_JWT'},gatewayErrorCode:'UNAUTHORIZED_LEGACY_JWT'}),'gateway');
  for(const result of [
    {status:500,data:{error:'SERVER_MISCONFIGURED'}},
    {status:401,data:{error:'unknown'}},
    {status:401,data:{code:'UNAUTHORIZED_LEGACY_JWT'}},
    {status:403,data:{error:'Unauthorized'}},
    {status:200,data:{code:401,message:'Invalid JWT'}},
  ])assert.equal(userAuthDenialLayer(result),null);
  assert.notEqual(userAuthDenialLayer({status:401,data:{error:'Unauthorized'}}),'gateway','Handler denial must not certify gateway verification');
});
